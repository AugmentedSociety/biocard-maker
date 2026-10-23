// before the other requires: db.js reads DB_PATH as soon as it loads
try {
  process.loadEnvFile();
}
catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

const { Bot, InputFile } = require('node-telegram-bot-api')
const { run, startWebhook } = require('node-telegram-bot-api/node')
const { createCanvas, loadImage, ImageData } = require('canvas')
const dayjs = require('dayjs');
const crypto = require('crypto');
const users = require('./db').users;
const frameData = require('./frames.json');
const path = require('path');

if (!process.env.TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN environment variable is missing. Can\'t start.')
  process.exit(1)
}

const bot = new Bot(process.env.TELEGRAM_TOKEN);

const printTemplate = t => {
  let md = frameData[t];
  if (!md) return 'Invalid template.';
  return `/${t} - recommended size ${md.drawArea[2]}x${md.drawArea[3]}px - Credits: ${md.credits}`;
}

bot.on('message', async (ctx, next) => {
  const msg = ctx.message;
  if (!users[msg.chat.id]) users[msg.chat.id] = {};
  if (msg.document) {
    return ctx.reply('Send the picture as photo, not as file!').catch(console.log)
  }
  if (msg.entities && msg.entities[0].type === 'bot_command') {
    let t = msg.text.split(' ')[0].replace('/', '');
    if (t in frameData) {
      users[msg.chat.id].template = t;
      let { drawArea } = frameData[t];
      return ctx.reply(`Great! Your template is now \`${t}\`. Recommended size for this template is *${drawArea[2]}x${drawArea[3]}px.*`, { parse_mode: 'Markdown' }).catch(console.log)
    }
  }
  if (!msg.photo) {
    // let the text commands below handle it
    return next();
  }
  let u = users[msg.chat.id];
  if (!u.template || !frameData[u.template]) {
    return ctx.reply('You have to tell me the template first. Type /templates to see, /template <template> to choose!').catch(console.log)
  }
  let { width, height, drawArea, cityArea, dateArea, nickArea, font } = frameData[u.template];
  if (!font) font = {};
  if (cityArea && cityArea.length && !u.location) {
    return ctx.reply('You have to tell me the location first. Type /location <location> to choose!').catch(console.log)
  }
  ctx.api.sendChatAction({ chat_id: msg.chat.id, action: 'upload_photo' }).catch(console.error)
  const { file_path } = await ctx.api.getFile({ file_id: msg.photo[msg.photo.length - 1].file_id })
  const picture = await loadImage(`https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`);
  let pw = picture.width, ph = picture.height;
  let x = drawArea[0], y = drawArea[1], w = drawArea[2], h = drawArea[2] * ph / pw;
  if (h < drawArea[3]) {
    h = drawArea[3];
    w = h * pw / ph;
    x = x - ((w - drawArea[2]) / 2);
  }
  if (h > drawArea[3]) {
    y = y - ((h - drawArea[3]) / 2);
  }
  const finalCanvas = createCanvas(width, height);
  const finalCtx = finalCanvas.getContext('2d')
  const frame = await loadImage(path.join(__dirname, 'frames', `${u.template}.png`));
  finalCtx.drawImage(picture, x, y, w, h)
  finalCtx.drawImage(frame, 0, 0, width, height)
  finalCtx.textBaseline = font.baseline || 'top';
  finalCtx.fillStyle = font.color || '#FFF';
  finalCtx.textAlign = font.align || 'left';
  if (cityArea && cityArea.length) {
    finalCtx.font = cityArea[3] + 'px Arial';
    finalCtx.fillText(u.location, cityArea[0], cityArea[1], cityArea[2]);
  }
  if (dateArea && dateArea.length) {
    let date = u.date ? u.date : dayjs().format('DD/MM/YY');
    finalCtx.font = dateArea[3] + 'px Arial';
    finalCtx.fillText(date, dateArea[0], dateArea[1], dateArea[2]);
  }
  if (nickArea && nickArea.length) {
    let nick = u.nick ? u.nick : msg.from.username;
    finalCtx.font = font.font || `${nickArea[3]}px Arial`;
    finalCtx.fillText(nick, nickArea[0], nickArea[1], nickArea[2]);
  }
  return ctx.api.sendPhoto({
    chat_id: msg.chat.id,
    photo: new InputFile(finalCanvas.toBuffer('image/png', { quality: 1 }), { filename: 'biocard.png', contentType: 'image/png' })
  })
});

bot.hears(/^\/(start|help)$/, (ctx) => {
  ctx.reply(`*Use this bot to generate a Biocard.*
  *Available commands:*
    /templates - See all Templates
    /template - See current Template
    /template <template> - Select a template
    /date - Reset date to current
    /date <date> - Set date
    /nick <nickname> - Set nickname
    /location - See current location
    /location <location> - Update your location
  `, { parse_mode: 'markdown' }).catch(console.log)
});

bot.hears(/^\/templates$/, (ctx) => {
  return ctx.reply(`*Available templates:* \n  ${Object.keys(frameData).map(printTemplate).join('\n  ')}`, { parse_mode: 'markdown' }).catch(console.log);
});

bot.hears(/^\/template$/, (ctx) => {
  const msg = ctx.message;
  let curTemplate = users[msg.chat.id].template;
  if (!curTemplate) return ctx.reply('No template selected. Use /template to see available templates.').catch(console.log);
  return ctx.reply(`*Current template:* ${printTemplate(curTemplate)}`, { parse_mode: 'Markdown' }).catch(console.log);
});

bot.hears(/\/location(.*)/, (ctx) => {
  const msg = ctx.message;
  let t = ctx.match[1].trim();
  if (!t) {
    if (users[msg.chat.id].location)
      return ctx.reply(`Your saved location is ${users[msg.chat.id].location}.`).catch(console.log)
    return ctx.reply(`No location set.`).catch(console.log)
  }
  users[msg.chat.id].location = t;
  return ctx.reply(`Great! Your location is now ${t}.`).catch(console.log)
});

bot.hears(/\/nick(.*)/, (ctx) => {
  const msg = ctx.message;
  let t = ctx.match[1].trim();
  if (!t) {
    return ctx.reply(`Your nickname is ${users[msg.chat.id].nick || msg.from.username}.`).catch(console.log)
  }
  users[msg.chat.id].nick = t;
  return ctx.reply(`Great! Your nickname is now ${t}.`).catch(console.log)
});

bot.hears(/\/date(.*)/, (ctx) => {
  const msg = ctx.message;
  let t = ctx.match[1].trim();
  if (!t) {
    users[msg.chat.id].date = undefined;
    return ctx.reply('Date reset to current date.');
  }
  users[msg.chat.id].date = t;
  return ctx.reply('Great! Now send me the picture you want to make the badge with. Use a picture with recommended proportions, otherwise it will get squished.').catch(console.log)
});

if (process.env.WEBHOOK_URL) {
  // regenerated on every start: setWebhook below hands the new one to Telegram
  const secretToken = crypto.randomBytes(32).toString('hex');
  startWebhook(bot, {
    port: Number(process.env.WEBHOOK_PORT) || 3000,
    path: new URL(process.env.WEBHOOK_URL).pathname,
    secretToken
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
  bot.api.setWebhook({ url: process.env.WEBHOOK_URL, secret_token: secretToken }).catch(console.error);
}
else {
  run(bot).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
