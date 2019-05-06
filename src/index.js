const express = require('express')
const path = require('path')
const serveStatic = require('serve-static')
const serveIndex = require('serve-index')
const luftdaten = require('./luftdatenHistory')
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
            } else if (await luftdaten.isDayAlreadyProcessed(day)) {
                res.send(`Day ${day} already exist`)
            } else if (luftdaten.isDayInQueue(day)) {
                res.send(`Day ${day} is in our queue and will be processed soon.`)
            } else if (!await luftdaten.isDateAvailableAtLuftdatenArchive(day)) {
                res.send(`Day ${day} is not available in the historical dataset of Luftdaten, try another day`)
            } else {
                res.send(`We don't have this day ${day} in our history yet, but will add this to the queue`)
                luftdaten.addToQueue(day)
            }
        } else {
            res.send('We like to see a date in your url, formated like this: "YYYY-MM-DD"')
        }
    } catch (error) {
        console.error(error)
        res.status(404).send(`some things went wrong. We're collecting the piece and try to glue them back, till then`)
    }
})

app.get('/availableLocations/:day', async (req, res) => {
    const day = req.params.day
    if (day && util.isValidDate(day)) {
        if (await luftdaten.isDayAlreadyProcessed(day)) {
            const locationsList = await luftdaten.getLocationsForDay(day)
            res.send(locationsList)
        } else {
            res.status(404).send(`we haven't processed this day ${day} yet`)
        }
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

app.listen(port, () => console.info(`Listening on port ${port}!`))
