const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    fullname: String,
    email: String,
    password: String,
    age: Number,
    gender: String,
    mobile: Number
})

const User = mongoose.model('User', userSchema)

module.exports = User;