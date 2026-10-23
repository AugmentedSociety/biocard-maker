const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, process.env.DB_PATH || 'db.json');

let saved;

try {
  saved = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  saved.users = saved.users || {};
}
catch (e) {
  saved = { users: {} };
}

const dbHandler = {
  get(target, key) {
    if (typeof target[key] === 'object' && target[key] !== null) {
      return new Proxy(target[key], dbHandler)
    } else {
      return target[key];
    }
  },
  set(target, key, value) {
    target[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(db));
    return true
  }
}

const db = new Proxy(saved, dbHandler);

module.exports = db;
