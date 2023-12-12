const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const dotenv = require('dotenv')
dotenv.config()
const cron = require('node-cron')

// database models
const User = require('./models/userModel.js')
const WeekList = require('./models/weeklistModel.js')

const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// scheduler for, after 7days --> isActive : false
cron.schedule('0 0 * * *', async () => {
    try {
        await WeekList.updateMany(
            { createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
            { $set: { isActive: false } }
        );
    } catch (error) {
        console.log("Sheduler Error: Error updating documents")
    }
})

// authentication
const isLoggedIn = (req, res, next) => {
    try {
        const { jwtoken } = req.headers
        const user = jwt.verify(jwtoken, process.env.JWT_SECRET)
        req.user = user
        next()
    } catch (error) {
        res.json({
            message: "You're not logged in!"
        })
    }
}

// for using middleware in every route
// app.use(isLoggedIn)

// default route
app.get('/', isLoggedIn, (req, res) => {
    res.json({
        message: "Welcome to the content"
    })
})

// health check
app.get('/healthcheck', (req, res) => {
    const health = {
        serverName: 'Week List',
        currentTime: Date.now(),
        state: 'active',
        responseTime: process.hrtime()
    }
    try {
        res.json(health)
    } catch (error) {
        health.message = 'inactive'
        res.status(503).json(health);
    }
})

// Register route
app.post('/register', async (req, res) => {
    try {
        const { fullname, email, password, age, gender, mobile } = req.body
        const user = await User.find({ $or: [{ email }, { mobile }] })
        if (user.length > 0) {
            return res.json({
                message: 'Email or mobile already exists!'
            })
        }
        const encryptedPassword = await bcrypt.hash(password, 10)
        const userDetails = { fullname, email, password: encryptedPassword, age, gender, mobile }
        await User.create(userDetails)
        const jwtoken = jwt.sign(userDetails, process.env.JWT_SECRET, { expiresIn: 60 * 60 })
        res.json({
            message: 'User registered successfully!',
            jwtoken
        })
    } catch (error) {
        res.json({
            message: 'Something went wrong!'
        })
    }
})

// login route
app.get('/login', async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email })
        if (user) {
            let passwordMatched = await bcrypt.compare(password, user.password)
            if (passwordMatched) {
                const jwtoken = jwt.sign(user.toJSON(), process.env.JWT_SECRET, { expiresIn: 60 * 60 })
                res.json({
                    message: "You've logged in successfully!",
                    jwtoken
                })
            }
            else {
                res.json({
                    message: 'Invalid credentials!'
                })
            }
        }
        else {
            res.json({
                message: "User does not exist"
            })
        }
    } catch (error) {
        res.json({
            message: 'Something went wrong!'
        })
    }
})

// weeklist creation
app.post('/create-weeklist', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const weeklists = await WeekList.find({ createdBy })
        const activeWeeklists = weeklists.filter(item => item.isActive && !item.isCompleted)
        if (activeWeeklists.length < 2) {
            const { tasks } = req.body
            const tasksList = tasks.map(task => {
                return { description: task }
            })
            const weeklistDetails = { createdBy, name: `Weeklist #${weeklists.length + 1}`, tasks: tasksList }
            await WeekList.create(weeklistDetails)
            res.json({
                message: 'Weeklist created successfully!'
            })
        }
        else {
            res.json({
                message: "Cannot create, exceeded the limit!"
            })
        }
    } catch (error) {
        res.json({
            message: 'Something went wrong!'
        })
    }
})

// get weeklists
app.get('/display-weeklists', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const weeklists = await WeekList.find({ createdBy })
        res.json({
            message: "Successfull!",
            data: weeklists
        })
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

// deleting weeklist
app.delete('/delete-weeklist/:weeklist_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id } = req.params
        const weeklist = await WeekList.findOne({ _id: weeklist_id, createdBy })
        if (weeklist) {
            const currentTime = new Date().getTime() / 1000
            const createdTime = weeklist.createdAt.getTime() / 1000
            const timePassed = (currentTime - createdTime) / 3600
            if (timePassed < 24) {
                await WeekList.findByIdAndDelete({ _id: weeklist_id })
                res.json({
                    message: `Deleted ${weeklist.name} successfully!`
                })
            } else {
                res.json({
                    message: "Could not delete. Exceeded modification time!"
                })
            }
        }
        else {
            res.json({
                message: "Weeklist does not exist!"
            })
        }
    } catch (error) {
        res.json({
            message: "Could not delete. Something went wrong!"
        })
    }
})

// adding new task
app.patch('/add-task/:weeklist_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id } = req.params
        const existingWeeklist = await WeekList.findOne({ _id: weeklist_id, createdBy })
        if (existingWeeklist) {
            const currentTime = new Date().getTime() / 1000
            const createdTime = existingWeeklist.createdAt.getTime() / 1000
            const timePassed = (currentTime - createdTime) / 3600
            if (timePassed > 24) {
                return res.json({
                    message: "Cannot add new task. Exceeded modification time."
                })
            }
            let { new_task } = req.body
            new_task = { description: new_task }
            const updatedWeekList = await WeekList.findByIdAndUpdate(
                { _id: weeklist_id },
                { $push: { tasks: new_task } },
                { new: true }
            )
            res.json({
                message: "Successfully added new task.",
                updatedWeekList
            })
        }
        else {
            res.json({
                message: "Weeklist not exists!"
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

// deleting a task
app.patch('/delete-task/:weeklist_id/:task_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id, task_id } = req.params
        const existingWeeklist = await WeekList.findOne({ _id: weeklist_id, createdBy })
        if (existingWeeklist) {
            const currentTime = new Date().getTime() / 1000
            const createdTime = existingWeeklist.createdAt.getTime() / 1000
            const timePassed = (currentTime - createdTime) / 3600
            if (timePassed > 24) {
                return res.json({
                    message: "Cannot delete task. Exceeded modification time."
                })
            }
            const taskPresent = existingWeeklist.tasks.some(task => task["_id"].equals(task_id))
            if (!taskPresent) {
                return res.json({
                    message: "Task does not exist."
                })
            }
            const updatedWeekList = await WeekList.findByIdAndUpdate(
                { _id: weeklist_id },
                { $pull: { tasks: { _id: task_id } } },
                { new: true }
            )
            res.json({
                message: "Successfully deleted task!",
                updatedWeekList
            })
        }
        else {
            res.json({
                message: "Weeklist not exists!"
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

// editting task
app.patch('/edit-task/:weeklist_id/:task_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id, task_id } = req.params
        let { updated_task } = req.body
        const existingWeeklist = await WeekList.findOne({ _id: weeklist_id, createdBy })
        if (existingWeeklist) {
            const currentTime = new Date().getTime() / 1000
            const createdTime = existingWeeklist.createdAt.getTime() / 1000
            const timePassed = (currentTime - createdTime) / 3600
            if (timePassed > 24) {
                return res.json({
                    message: "Cannot edit task. Exceeded modification time."
                })
            }
            const taskIndex = existingWeeklist.tasks.findIndex(task => task._id.equals(task_id))
            if (taskIndex !== -1) {
                existingWeeklist.tasks[taskIndex].description = updated_task
                const updatedWeekList = await existingWeeklist.save()
                res.json({
                    message: "Updated task successfully.",
                    updatedWeekList
                })
            }
            else {
                res.json({
                    message: "Task does not exist."
                })
            }
        }
        else {
            res.json({
                message: "Weeklist does not exist."
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

// mark/unmark task
app.patch('/mark-task/:weeklist_id/:task_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id, task_id } = req.params
        const existingWeeklist = await WeekList.findOne({ _id: weeklist_id, createdBy })
        if (existingWeeklist) {
            if (!existingWeeklist.isActive) {
                return res.json({
                    message: "Inactive weeklist."
                })
            }
            if (existingWeeklist.isCompleted) {
                return res.json({
                    message: "Cannot unmark. The weeklist is already completed."
                })
            }
            const taskIndex = existingWeeklist.tasks.findIndex(task => task._id.equals(task_id))
            if (taskIndex !== -1) {
                const value = existingWeeklist.tasks[taskIndex].isCompleted
                existingWeeklist.tasks[taskIndex].isCompleted = !value
                const updatedWeekList = await existingWeeklist.save()

                updatedWeekList.isCompleted = updatedWeekList.tasks.every(task => task.isCompleted)
                await updatedWeekList.save()

                res.json({
                    message: "Marked task successfully.",
                    updatedWeekList
                })
            }
            else {
                res.json({
                    message: "Task does not exist."
                })
            }
        }
        else {
            res.json({
                message: "Weeklist does not exist."
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong."
        })
    }
})


app.get('/weeklist/:weeklist_id', isLoggedIn, async (req, res) => {
    try {
        const createdBy = req.user.email
        const { weeklist_id } = req.params
        const weeklist = await WeekList.findOne({ createdBy, _id: weeklist_id })
        if (weeklist) {
            res.json({
                message: "Successfully fetched weeklist information.",
                data: weeklist
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

app.get('/feed', isLoggedIn, async (req, res) => {
    try {
        const activeWeeklists = await WeekList.find({ isActive: true, isCompleted: false })
        if (activeWeeklists.length > 0) {
            res.json({
                message: "Successfully fetched all active weeklists.",
                activeWeeklists
            })
        }
        else {
            res.json({
                message: "No active weeklists available!"
            })
        }
    } catch (error) {
        res.json({
            message: "Something went wrong!"
        })
    }
})

// for Page not found
app.get('*', (req, res) => {
    res.status(404).json({
        message: 'Page not found!'
    })
})

app.listen(process.env.PORT, () => {
    mongoose.connect(process.env.MONGODB_URL)
        .then(() => console.log(`Server running on http://localhost:${process.env.PORT}`))
        .catch((error) => console.log(error))
})