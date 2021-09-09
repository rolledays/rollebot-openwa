// CREATED BY ADITIA
// MABAR CODM NICK GW 141-Dynamox
import { createReadFileSync, initGlobalVariable } from './utils/index.js'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { create, Client, decryptMedia } from '@open-wa/wa-automate'
import { schedule, sewa } from './lib/index.js'
import chromeLauncher from 'chrome-launcher'
import { scheduleJob } from 'node-schedule'
import { HandleMsg } from './HandleMsg.js'
import options from './utils/options.js'
import puppeteer from 'puppeteer-extra'
import moment from 'moment-timezone'
import PQueue from 'p-queue'
import figlet from 'figlet'
import fs from 'fs-extra'
import { spawn } from 'child_process'
import getDB from './db.js'
const path = chromeLauncher.Launcher.getInstallations()[0]
const jobList = JSON.parse(createReadFileSync('./data/schedule.json'))
const setting = JSON.parse(createReadFileSync('./settings/setting.json'))
moment.tz.setDefault('Asia/Jakarta').locale('id')
initGlobalVariable()

let {
    ownerNumber,
    groupLimit,
    prefix
} = setting

const queue = new PQueue({ concurrency: 9, timeout: 13000, throwOnTimeout: true })
queue.on('next', () => {
    if (queue.size > 0 || queue.pending > 0) console.log(color('[==>>]', 'red'), `In-process: ${queue.pending} In-queue: ${queue.size}`)
})

const start = async (client = new Client()) => {
    try {
        console.log(color(figlet.textSync('----------------', { horizontalLayout: 'default' })))
        console.log(color(figlet.textSync('  RolleBOT', { horizontalLayout: 'default' })))
        console.log(color('[DEV]'), color('Aditia', 'yellow'))
        console.log(color('[~>>]'), color('BOT Started!', 'green'))
        console.log(color('[>..]'), color('Owner Commands: /menuowner', 'green'))
        client.sendText(ownerNumber, `Bot Started!`)

        puppeteer.use(StealthPlugin())
        const browser = await puppeteer.launch({
            executablePath: path,
            headless: true,
            args: [
                '--single-process',
                '--no-zygote',
                '--renderer-process-limit=1',
                '--no-first-run',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--ignore-certificate-errors'
            ]
        }).catch(e => console.log(e))

        // process unread message
        client.getAllUnreadMessages().then(async unreadMessages => {
            for (let message of unreadMessages) {
                if (!message.isGroupMsg) await queue.add(() => HandleMsg(message, browser, client)).catch(err => {
                    console.log((err.name === 'TimeoutError') ? `${color('[==>>]', 'red')} Error task process timeout!` : err)
                    if (queue.isPaused) queue.start()
                })
            }
        })

        // when someone sends a message
        client.onMessage(async message => {
            client.setPresence(true)
            client.getAmountOfLoadedMessages() // menghapus pesan cache jika sudah 3000 pesan.
                .then(async(msg) => {
                    if (msg >= 3000) {
                        console.log('[CLNT]', color(`Loaded Message Reach ${msg}, cuting message cache...`, 'yellow'))
                        client.cutMsgCache()
                        }
                })
            await queue.add(() => HandleMsg(message, browser, client)).catch(err => {
                console.log((err.name === 'TimeoutError') ? `${color('[==>>]', 'red')} Error task process timeout!` : err)
                if (queue.isPaused) queue.start()
            })

            if (queue.isPaused) queue.start()
        }).catch(err => {
            console.log(err)
        })

        // Load Scheduled Job
        // client, from, quotedId, content, date, isQuoted

        try {
            jobList.jobs.forEach(async (job) => {
                schedule.loadJob(client, job.from, job.quotedId, job.content, job.date, job.isQuoted).catch(e => console.log(e))
            })
            console.log(color('[LOGS]', 'grey'), `${jobList.jobs.length} ScheduledJobs Loaded`)

            // check sewa every 4 hours
            scheduleJob('0 */4 * * *', () => {
                console.log(color('[LOGS]', 'grey'), `Checking sewa expiring...`)
                sewa.checkExpireSewa(client).catch(e => console.log(e))
            })

            // Clear chat & restart limit every day at 01:01
            scheduleJob('1 1 * * *', async () => {
                const chats = await client.getAllChats()
                client.sendText(ownerNumber, `Processed auto clear with ${chats.length} chat!`)
                let deleted = 0, cleared = 0
                for (let chat of chats) {
                    if (!chat.isGroup && chat.id !== ownerNumber) {
                        await client.deleteChat(chat.id)
                        deleted += 1
                    }
                    if (chat.id === ownerNumber || chat.isGroup) {
                        await client.clearChat(chat.id)
                        cleared += 1
                    }
                }
                client.sendText(ownerNumber, `Chat deleted : ${deleted}\nChat cleared : ${cleared}`)
            })
        } catch (e) {
            console.log(e)
        }

        // Listen saweria
        sewa.listenSaweria(client, browser).catch(e => console.log(e))

        // When the bot is invited to the group
        client.onAddedToGroup(async chat => {
            console.log(color('[==>>]', 'red'), `Someone is adding bot to group, lol~ groupId: ${chat.groupMetadata.id}`)
            client.getAllGroups().then((groups) => {
                // kondisi ketika batas group bot telah tercapai, ubah di file settings/setting.json
                console.log(color('[==>>]', 'red'), `Group total: ${groups.length}. groupLimit: ${groupLimit}`)
                if (groups.length > groupLimit) {
                    console.log(color('[==>>]', 'red'), `So this is exceeding the group limit.`)
                    client.sendText(chat.groupMetadata.id,
                        `Mohon maaf, untuk mencegah overload, group pada bot dibatasi.\n` +
                        `Total group: ${groups.length}/${groupLimit}\n` +
                        `Chat /owner untuk sewa. harga 10k masa aktif 1 bulan.\n`
                    )
                    setTimeout(() => {
                        client.leaveGroup(chat.groupMetadata.id)
                        client.deleteChat(chat.groupMetadata.id)
                    }, 3000)
                } else {
                    client.simulateTyping(chat.groupMetadata.id, true).then(async () => {
                        client.sendText(chat.groupMetadata.id, `Hai guys ðŸ‘‹ perkenalkan saya RolleBOT. Untuk melihat perintah atau menu yang tersedia pada bot, kirim *${prefix}menu*. Tapi sebelumnya pahami dulu *${prefix}tnc*`)
                    })
                }
            })
        })

        client.onIncomingCall(async call => {
            // When someone calls bot
            if (!call.isGroup || !call.participants.length > 1) {
                console.log(color('[==>>]', 'red'), `Someone is calling bot, lol~ id: ${call.peerJid}`)
                client.sendText(call.peerJid, `MELANGGAR RULES!`)
                setTimeout(() => {
                    client.contactBlock(call.peerJid)
                }, 3000)
            }
        })

        // Mempertahankan sesi agar tetap nyala
        client.onStateChanged((state) => {
            console.log(color('[~>>>]', 'red'), state)
            if (state === 'CONFLICT' || state === 'UNLAUNCHED') client.forceRefocus().then(() => queue.start())
        }).catch((err) => {
            console.log(err)
        })

        // When someone logs in/out of group
        const host = await client.getHostNumber() + '@c.us'
        client.onGlobalParticipantsChanged(async change => {
            //console.log(change)
        try{
          const info = await client.getChatById(change.chat)
          const hasByProperty = Object.prototype.hasOwnProperty.call(change, 'by')
          console.log(`${change.action} => ${info.name}`);
          if (change.action == 'add' && hasByProperty && change.who !== host) {
            const msg = await getDB.msg_add(change.chat);
            const who = change.who;
            var target = who.match(/\d+/g);
            if (msg == undefined) {
              return
            }else if (msg.msg_add.length == 0) {
                client.sendTextWithMentions(change.chat, `Hii @${target}\nSelamat datang di *${info.name}*, Silahkan untuk memperkenalkan diri.\n\nKetik ${prefix}menu untuk menggunakan bot`);
            }else{
              const get_db = decodeURIComponent(msg.msg_add);
              client.sendText(change.chat, `${get_db}`);
            }
          }else if (change.action == 'remove') {
            const msg = await getDB.msg_kick(change.chat);
            const who = change.who;
            var target = who.match(/\d+/g);
            if (msg == undefined) {
              return
            }else if (msg.msg_kick.length == 0) {
                client.sendTextWithMentions(change.chat, `Selamat tinggal @${target} ðŸ‘‹`);
            }else{
              const get_db = decodeURIComponent(msg.msg_kick);
              client.sendText(change.chat, `${get_db}`);
            }
          }
        }catch(err){console.log(err)}
        // Saat host keluar
        if (change.action === 'remove' && change.who == host) {
            const ngegas = JSON.parse(createReadFileSync('./data/ngegaskick.json'))
            const antiLinkGroup = JSON.parse(createReadFileSync('./data/antilinkgroup.json'))
            const antiLink = JSON.parse(createReadFileSync('./data/antilink.json'))
            let _id = change.chat
            let pos = ngegas.indexOf(_id)
            if (pos !== -1) {
                ngegas.splice(pos, 1)
                fs.writeFileSync('./data/ngegaskick.json', JSON.stringify(ngegas))
            }
            let posa = antiLinkGroup.indexOf(_id)
            if (posa !== -1) {
                antiLinkGroup.splice(posa, 1)
                fs.writeFileSync('./data/antilinkgroup.json', JSON.stringify(antiLinkGroup))
            }
            let posd = antiLink.indexOf(_id)
            if (posd !== -1) {
                antiLink.splice(posd, 1)
                fs.writeFileSync('./data/antilink.json', JSON.stringify(antiLink))
            }
        }
    }).catch(e => {
        console.log(color('[ERR>]', 'red'), e)
    })

    const unhandledRejections = new Map()
    process.on('unhandledRejection', (reason, promise) => {
        unhandledRejections.set(promise, reason)
    })
    process.on('rejectionHandled', (promise) => {
        unhandledRejections.delete(promise)
    })
    process.on('Something went wrong', function(err) {
        console.log('Caught exception: ', err)
    })
    process.on('unhandledRejection', (reason, promise) => {
        console.log('Unhandled Rejection at:', promise, 'reason:', reason)
        spawn('restart.cmd')
    })

    client.getPage().on('error', () => {
        client.sendText(ownerNumber, `âŒ› Page Error! Server bot akan direstart!`)
        spawn('restart.cmd')
    })
    
    client.onMessageDeleted(async message => {
        try {
            const antiDelete = JSON.parse(createReadFileSync('./data/antidelete.json'))
            const isAntiDelete = antiDelete.includes(message.from)
            if (message.author != host && isAntiDelete) {
                await client.sendTextWithMentions(message.from,
                    `â€¼ï¸ã€˜ ANTI DELETE ã€™â€¼ï¸\n` +
                    `${q3}Who     :${q3} @${message.author.replace('@c.us', '')}\n` +
                    `${q3}When    :${q3} ${moment(message.t * 1000).format('DD MMM HH:mm:ss')}\n` +
                    `${q3}Type    :${q3} ${message.type.replace(/^\w/, (c) => c.toUpperCase())}` +
                    `${message.type == 'chat' ? `\n${q3}Content :${q3}\n\n${message.body}` : ``}`
                )
                if (['image', 'video', 'ptt', 'audio', 'document'].includes(message.type)) {
                    const mediaData = await decryptMedia(message)
                    await client.sendFile(message.from, `data:${message.mimetype};base64,${mediaData.toString('base64')}`, '', message.caption)
                }
                if (message.type == 'sticker') {
                    const mediaData = await decryptMedia(message)
                    await client.sendImageAsSticker(message.from, mediaData, { pack: 'RolleBOT', author: 'Powered', keepScale: true })
                }
            }
        } catch (err) {
            console.log(color('[ERR>]', 'red'), err)
        }
    }).catch(e => {
        console.log(color('[ERR>]', 'red'), e)
    })

    } catch (err) {
        console.log(color('[ERR>]', 'red'), err)
    }
}

//create session
create(options(true, start))
    .then(client => start(client))
    .catch(err => new Error(err))

