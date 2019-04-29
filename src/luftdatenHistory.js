const got = require('got')
const csvParse = require('csv-parse/lib/sync')
const fs = require('fs-extra')
const path = require('path')
const cheerio = require('cheerio')

const staticDirectoryPath = path.join(__dirname, '..', 'static')
let running = false
const dayQueue = new Set()

setInterval(() => {
    runner()
}, 1000)

const delay = (duration) => {
    return new Promise(resolve => setTimeout(resolve, duration))
}

const runner = () => {
    if (running) return
    if (dayQueue.size === 0) return
    console.log(dayQueue.entries())
    const day = [...dayQueue][0]
    console.log('Starting history processor ', day)
    generateHistory(day)
}

const isDayAlreadyProcessed = (date) => {
    return new Promise(async (resolve, reject) => {
        try {
            const listOfDays = new Set()
            const phenomenomDirectoryList = await fs.readdir(staticDirectoryPath)
            if (!phenomenomDirectoryList.length) return resolve(false)
            for (const phenomenom of phenomenomDirectoryList) {
                const PM10DirectoryPath = path.join(staticDirectoryPath, phenomenom)
                const folderList = await fs.readdir(PM10DirectoryPath)
                if (!folderList.length) return resolve(false)
                for (const locationDir of folderList) {
                    const locationDirPath = path.join(PM10DirectoryPath, locationDir)
                    const days = await fs.readdir(locationDirPath)
                    for (const day of days) {
                        listOfDays.add(day)
                    }
                }
            }
            resolve(listOfDays.has(date))
        } catch (error) {
            reject(error)
        }
    })
}

const getAvailableDays = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const listOfDays = new Set()
            const phenomenomDirectoryList = await fs.readdir(staticDirectoryPath)
            if (!phenomenomDirectoryList.length) return resolve([])
            for (const phenomenom of phenomenomDirectoryList) {
                const PM10DirectoryPath = path.join(staticDirectoryPath, phenomenom)
                const folderList = await fs.readdir(PM10DirectoryPath)
                if (!folderList.length) return resolve([])
                for (const locationDir of folderList) {
                    const locationDirPath = path.join(PM10DirectoryPath, locationDir)
                    const days = await fs.readdir(locationDirPath)
                    for (const day of days) {
                        listOfDays.add(day)
                    }
                }
            }
            resolve([...listOfDays])
        } catch (error) {
            reject(error)
        }
    })
}

const getLocationsForDay = (date) => {
    return new Promise(async (resolve, reject) => {
        try {
            const listOfLocations = new Set()
            const phenomenomDirectoryList = await fs.readdir(staticDirectoryPath)
            for (const phenomenom of phenomenomDirectoryList) {
                const locationsDirectoryPath = path.join(staticDirectoryPath, phenomenom)
                const locationDirectoryList = await fs.readdir(locationsDirectoryPath)
                for (const location of locationDirectoryList) {
                    const daysDirectoryPath = path.join(locationsDirectoryPath, location)
                    const dayDirectoryList = await fs.readdir(daysDirectoryPath)
                    if (dayDirectoryList.find(day => day === date)) {
                        listOfLocations.add(location)
                    }
                }
            }
            resolve([...listOfLocations])
        } catch (error) {
            reject(error)
        }
    })
}

const isDayInQueue = (date) => {
    return dayQueue.has(date)
}

const addToQueue = (day) => {
    dayQueue.add(day)
}

const generateHistory = async (date) => {
    if (running) return
    running = true
    let counter = 0
    const csvList = []
    const html = (await got(`https://archive.luftdaten.info/${date}/`)).body
    const $ = cheerio.load(html)
    $('table').find('tbody td a').each((index, value) => {
        const href = $(value).attr('href')
        if (href.includes('sds011')) {
            csvList.push(href)
        }
    })

    const data = {}
    for (let index = 0; index < csvList.length; index++) {
        const csvFileName = csvList[index]
        const sensorId = parseInt(csvFileName.split('_')[3].split('.')[0])
        try {
            const sensorDataCSV = (await got(`https://archive.luftdaten.info/${date}/${csvFileName}`)).body
            const records = csvParse(sensorDataCSV, {
                columns: true,
                delimiter: ';',
                cast: true
            })
            const sensor = records[0]
            const zone = `${Math.floor(sensor.lat)}-${Math.floor(sensor.lon)}`
            const PM10Timeseries = records.map(record => {
                return [
                    record.timestamp,
                    record.P1
                ]
            })

            const PM10 = {
                id: sensorId,
                manufacturer: sensor.manufacturer,
                name: sensor.sensor_type,
                phenomenon: 'pm10',
                date,
                location: {
                    id: sensor.location,
                    latitude: sensor.lat,
                    longitude: sensor.lon
                },
                timeserie: PM10Timeseries
            }

            if (!data['PM10']) data['PM10'] = {}
            if (!data['PM10'][zone]) data['PM10'][zone] = {}
            if (!data['PM10'][zone][date]) data['PM10'][zone][date] = {}

            data['PM10'][zone][date][PM10.id] = PM10

            const PM25Timeseries = records.map(record => {
                return [
                    record.timestamp,
                    record.P2
                ]
            })

            const PM25 = {
                id: sensorId,
                manufacturer: sensor.manufacturer,
                name: sensor.sensor_type,
                phenomenon: 'pm25',
                date,
                location: {
                    id: sensor.location,
                    latitude: sensor.lat,
                    longitude: sensor.lon
                },
                timeserie: PM25Timeseries
            }

            if (!data['PM25']) data['PM25'] = {}
            if (!data['PM25'][zone]) data['PM25'][zone] = {}
            if (!data['PM25'][zone][date]) data['PM25'][zone][date] = {}

            data['PM25'][zone][date][PM25.id] = PM25
        } catch (error) {
            console.error(error)
        }
        counter++
        console.log(counter, date, sensorId)
        await delay(500)
    }
    for (const phenomenom in data) {
        if (data.hasOwnProperty(phenomenom)) {
            for (const zone in data[phenomenom]) {
                if (data[phenomenom].hasOwnProperty(zone)) {
                    for (const date in data[phenomenom][zone]) {
                        if (data[phenomenom][zone].hasOwnProperty(date)) {
                            try {
                                const sensors = Object.values(data[phenomenom][zone][date])
                                const phenomenomFilePath = path.join(staticDirectoryPath, phenomenom, zone, date, 'data.json')
                                fs.outputJson(phenomenomFilePath, sensors, (err) => {
                                    if (err) throw err
                                })
                                console.log(phenomenomFilePath)
                            } catch (error) {
                                console.error(error)
                            }
                        }
                    }
                }
            }
        }
    }
    dayQueue.delete(date)
    running = false
}

module.exports = {
    generateHistory,
    isDayAlreadyProcessed,
    addToQueue,
    isDayInQueue,
    getLocationsForDay,
    getAvailableDays
}
