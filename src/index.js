const express = require('express')
const path = require('path')
const serveStatic = require('serve-static')
const serveIndex = require('serve-index')
const luftdatenHistory = require('./luftdatenHistory')
const luftdatenAverage = require('./luftdatenAverage')
const util = require('./utlility')
const initLogstash = require('@appsaloon/logger-js').default
const logstashOptions = {
    protocol: 'https',
    hostname: 'elk.appsaloon.be',
    path: 'app-backend',
    site: 'influencair/history'
}
initLogstash(logstashOptions)

const app = express()
const port = 8081

app.get('/generateHistory/:day', async (req, res) => {
    try {
        const day = req.params.day
        if (day && util.isValidDate(day)) {
            if (Date.parse(day) > Date.now()) {
                res.send('We\'re a historic data storage, we cannot predict the future Air-Q')
            } else if (await luftdatenHistory.isDayAlreadyProcessed(day)) {
                res.send(`Day ${day} already exist`)
            } else if (luftdatenHistory.isDayInQueue(day)) {
                res.send(`Day ${day} is in our queue and will be processed soon.`)
            } else if (!await luftdatenHistory.isDateAvailableAtLuftdatenArchive(day)) {
                res.send(`Day ${day} is not available in the historical dataset of Luftdaten, try another day`)
            } else {
                res.send(`We don't have this day ${day} in our history yet, but will add this to the queue`)
                luftdatenHistory.addToQueue(day)
            }
        } else {
            res.send('We like to see a date in your url, formated like this: "YYYY-MM-DD"')
        }
    } catch (error) {
        console.error(error)
        res.status(404).send(`some things went wrong. We're collecting the piece and try to glue them back, till then`)
    }
})

app.get('/generateAverage/:sensor', (req, res) => {
    const sensorId = Number.parseInt(req.params.sensor)
    console.log(sensorId)
    if (Number.isNaN(sensorId)) {
        res.status(404).send('Your sensorId should be a number')
    } else {
        if (sensorId < 27 || sensorId > 100000) {
            res.status(404).send('Your sensorId is either to small or to big')
        } else {
            if (luftdatenAverage.isSensorInQueue(sensorId)) {
                res.send(`Sensor ${sensorId} is in our queue and will be processed soon.`)
            } else {
                res.send('Thanks, we added your request to our queue. It will take some time to process')
                luftdatenAverage.addToQueue(sensorId)
            }
        }
    }
})

app.get('/availableLocations/:day', async (req, res) => {
    const day = req.params.day
    if (day && util.isValidDate(day)) {
        if (await luftdatenHistory.isDayAlreadyProcessed(day)) {
            const locationsList = await luftdatenHistory.getLocationsForDay(day)
            res.send(locationsList)
        } else {
            res.status(404).send(`we haven't processed this day ${day} yet`)
        }
    }
})

app.get('/availableDays', async (req, res) => {
    try {
        const days = await luftdatenHistory.getAvailableDays()
        res.send(days)
    } catch (error) {
        console.error(error)
        res.status(500)
    }
})

app.use(serveStatic(path.join(__dirname, '..', 'static'), {
    index: false,
    maxAge: 1000 * 60 * 60 * 24,
    immutable: true
}))
app.use(serveIndex(path.join(__dirname, '..', 'static'), {
    icons: true
}))

app.use((req, res, next) => {
    var err = new Error('Not Found')
    err.status = 404
    next(err)
})

app.use((err, req, res, next) => {
    console.error('Something went wrong:', err)
    res.status(err.status || 500).json({
        message: err.message,
        error: err
    })
})

app.listen(port, () => console.info(`Listening on port ${port} !`))
