var mysql = require("mysql2");
var pool = mysql.createPool({
  socketPath: "/run/mysqld/mysqld.sock",
  user: "pmclub",
  database: "pmclub",
});

module.exports.pool = pool;
