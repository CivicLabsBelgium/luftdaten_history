const express = require('express')
const path = require('path')
const serveStatic = require('serve-static')
const serveIndex = require('serve-index')
const luftdaten = require('./luftdatenHistory')

const app = express()
const port = 8081

// luftdaten('2019-04-23')
app.get('/generateHistory/:day', async (req, res) => {
    const day = req.params.day
    if (day && !isNaN(Date.parse(day))) {
        if (Date.parse(day) > Date.now() - (1000 * 60 * 60 * 24)) return res.send('We\'re a historic data storage, we cannot predict the future')
        if (await luftdaten.isDayAlreadyProcessed(day)) {
            res.send(`Day ${day} already exist`)
        } else if (luftdaten.isDayInQueue(day)) {
            res.send(`Day ${day} is in our queue and will be processed soon.`)
        } else {
            res.send(`>e don't have this day ${day} in our history yet, but will add this to the queue`)
            luftdaten.addToQueue(day)
        }
    } else {
        res.send('We like to see a date in your url formated like this (YYYY-MM-DD)')
    }
})

app.get('/availableLocations/:day', async (req, res) => {
    const day = req.params.day
    if (day && !isNaN(Date.parse(day))) {
        if (await luftdaten.isDayAlreadyProcessed(day)) {
            const locationsList = await luftdaten.getLocationsForDay(day)
            res.send(locationsList)
        } else (
            res.status(404).send(`we haven't processed this day ${day} yet`)
        )
    }
})

app.get('/availableDays', async (req, res) => {
    try {
        const days = await luftdaten.getAvailableDays()
        res.send(days)
    } catch (error) {
        console.error(error)
        res.status(500)
    }
})

app.use(serveStatic(path.join(__dirname, '..', 'static'), {
    index: false
}))
app.use(serveIndex(path.join(__dirname, '..', 'static'), {
    icons: true
}))

app.listen(port, () => console.log(`Listening on port ${port}!`))
