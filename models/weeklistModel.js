const mongoose = require('mongoose')

const tasksShema = mongoose.Schema({
    description: String,
    isCompleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true })

const weeklistSchema = mongoose.Schema({
    createdBy: String,
    name: String,
    isActive: {
        type: Boolean,
        default: true
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    tasks: [tasksShema]
}, { timestamps: true })

const WeekList = mongoose.model('WeekList', weeklistSchema)

module.exports = WeekList