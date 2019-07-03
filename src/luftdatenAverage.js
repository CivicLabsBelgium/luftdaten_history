const got = require('got')
const csvParse = require('csv-parse/lib/sync')
const fs = require('fs-extra')
const path = require('path')
const cheerio = require('cheerio')

let running = false
const staticDirectoryPath = path.join(__dirname, '..', 'static')
const sensorQueue = new Set()

setInterval(() => {
    runner()
}, 1000)

const runner = () => {
    if (running) return
    if (sensorQueue.size === 0) return
    console.info(sensorQueue.entries())
    const sensor = [...sensorQueue][0]
    console.info('Starting history processor ', sensor)
    generateAverages(sensor)
}

const isSensorInQueue = (date) => {
    return sensorQueue.has(date)
}

const addToQueue = (day) => {
    sensorQueue.add(day)
}

const luftdatenArchiveListOfDates = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const directoryList = new Set()
            const html = (await got(`https://archive.luftdaten.info/`)).body
            const $ = cheerio.load(html)
            $('table').find('tbody td a').each((index, value) => {
                const name = $(value).text().split('/').shift()
                const date = Date.parse(name)
                if (!isNaN(date) && date > Date.parse('2018-07-29')) {
                    directoryList.add(name)
                }
            })
            resolve([...directoryList])
        } catch (error) {
            reject(error)
        }
    })
}

const generateAverages = async (sensorId) => {
    if (sensorId === undefined) return
    running = true
    let availableDates = await luftdatenArchiveListOfDates()
    const pm10File = path.join(staticDirectoryPath, 'dailyAverage', 'PM10', sensorId + '', 'data.json')
    const pm25File = path.join(staticDirectoryPath, 'dailyAverage', 'PM25', sensorId + '', 'data.json')
    let pm10Data = {}
    let pm25Data = {}
    try {
        if (await fs.pathExists(pm10File) && await fs.pathExists(pm25File)) {
            pm10Data = await fs.readJSON(pm10File)
            pm25Data = await fs.readJSON(pm25File)
            // remove dates from availableDates
            const firstDate = Date.parse(pm10Data.firstDate)
            const lastDate = Date.parse(pm10Data.lastDate)
            availableDates = availableDates.filter(date => Date.parse(date) < firstDate || Date.parse(date) > lastDate)
        } else {
            pm10Data = {
                id: sensorId,
                phenomenon: 'pm10',
                location: {},
                dailyAverages: []
            }
            pm25Data = {
                id: sensorId,
                phenomenon: 'pm25',
                location: {},
                dailyAverages: []
            }
        }
    } catch (error) {
        console.error(error)
        return
    }

    const dailyAveragesPm10 = new Map(pm10Data.dailyAverages.map(average => [average.date, average]))
    const dailyAveragesPm25 = new Map(pm25Data.dailyAverages.map(average => [average.date, average]))

    for (let index = 0; index < availableDates.length; index++) {
        const date = availableDates[index]
        try {
            const url = `https://archive.luftdaten.info/${date}/${date}_sds011_sensor_${sensorId}.csv`
            const sensorDataCSV = (await got(url)).body
            const records = csvParse(sensorDataCSV, {
                columns: true,
                delimiter: ';',
                cast: true
            })
            if (!pm10Data.location.id) {
                pm10Data.location = {
                    id: records[0].location,
                    latitude: records[0].lat,
                    longitude: records[0].lon
                }
                pm25Data.location = {
                    id: records[0].location,
                    latitude: records[0].lat,
                    longitude: records[0].lon
                }
            }
            const totals = records.reduce((acc, record) => {
                acc.pm10 += record.P1
                acc.pm25 += record.P2
                return acc
            }, { pm10: 0, pm25: 0 })
            const averages = {
                pm10: Math.round((totals.pm10 / records.length) * 100) / 100,
                pm25: Math.round((totals.pm25 / records.length) * 100) / 100
            }

            dailyAveragesPm10.set(date, { date, value: averages.pm10 })
            dailyAveragesPm25.set(date, { date, value: averages.pm25 })
        } catch (error) {
            console.error(error.statusMessage, date)
        }
    }
    // saving time
    pm10Data.dailyAverages = [...dailyAveragesPm10.values()]
    pm25Data.dailyAverages = [...dailyAveragesPm25.values()]

    const firstLastDates = pm10Data.dailyAverages.reduce((acc, average) => {
        if (Date.parse(average.date) < acc.first) acc.first = Date.parse(average.date)
        if (Date.parse(average.date) > acc.last) acc.last = Date.parse(average.date)
        return acc
    }, { first: Date.now(), last: 0 })

    pm10Data.firstDate = firstLastDates.first.toString()
    pm10Data.lastDate = firstLastDates.last.toString()
    pm25Data.firstDate = firstLastDates.first.toString()
    pm25Data.lastDate = firstLastDates.last.toString()

    try {
        await fs.outputJson(pm10File, pm10Data)
        await fs.outputJson(pm25File, pm25Data)
    } catch (error) {
        console.error(error)
    }
    running = false
    sensorQueue.delete(sensorId)
}

module.exports = {
    generateAverages,
    addToQueue,
    isSensorInQueue
}