// THE PURE MATH, APPLIED MATH, COMBINATORICS & OPTIMIZATION CLUB WEBSITE
// Written with love by Evan Girardin, W22/S22/W23/S23/F23 PMC president
// Please direct all hate mail to evangirardin at gmail dot com

const express = require("express");
const app = express();
const port = 3000;
const multer = require("multer");
const util = require("util");

const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const showdown = require("showdown");
const serveIndex = require("serve-index");
const serveStatic = require("serve-static");
const winston = require("winston");
const crypto = require("node:crypto");
require("dotenv").config();

const { ICalCalendar } = require("ical-generator");

const options = {
  file: {
    level: "info",
    filename: "pmc.log",
    handleExceptions: true,
    json: true,
    maxsize: 5242880,
    maxFiles: 5,
    colorize: false,
  },
  console: {
    level: "debug",
    handleExceptions: true,
    json: false,
    colorize: true,
  },
};
const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.File(options.file),
    new winston.transports.Console(options.console),
  ],
  exitOnError: false,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.align(),
    winston.format.printf(
      (info) => `[${info.level}] ${[info.timestamp]}: ${info.message}`,
    ),
  ),
});

// Showdown extension to wrap images in containers
const imgWrapper = (converter) => {
  return [
    {
      type: "output",
      regex: "<img (.*)/>",
      replace: '<div class="imgContainer"><img $1></div>',
    },
  ];
};
showdown.extension("imgWrapper", imgWrapper);

/*
  Showdown extension for doing HTML details/summary
  This is probably fragile, so don't get too cute with it :P
  SYNTAX:
    :> (summary)
    (details -- this can span many lines)
    <:
*/
const hidden = (converter) => {
  return [
    {
      type: "lang",
      filter: (text, converter, options) => {
        const mainRegex = new RegExp("(^:>(.*\n)*?(<:\n))", "gm");
        text = text.replace(mainRegex, (match, content) => {
          const summary = content
            .split("\n")[0]
            .replace(/^([ \t]*):>([ \t])?/gm, ""); // only first line
          const details = content
            .replace(/^([ \t]*):>([ \t])?.*\n/gm, "")
            .replace(/^<:\n/gm, ""); // remove first line, <:
          const foo = converter.makeHtml(summary);
          const bar = converter.makeHtml(details);
          return `\n<details><summary>${foo.slice(3).slice(0, -4)}</summary>\n${bar}</details>\n`;
          // Note: I do the slice stuff to get rid of the <p> and </p> which
          //   I am assuming wrap it. Don't do anything funny here or it'll break.
        });
        return text;
      },
    },
  ];
};
showdown.extension("hidden", hidden);

showdown.setOption("extensions", [hidden, imgWrapper]);
showdown.setOption("tables", true);
showdown.setOption("simpleLineBreaks", true);
showdown.setOption("emoji", true);
showdown.setOption("tasklists", true);
showdown.setOption("simplifiedAutoLink", true);
showdown.setOption("strikethrough", true);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const upload = multer({
  dest: path.join(__dirname, "./public/img/temp"),
});

const mysql = require("mysql2");
const connection = mysql.createPool({
  socketPath: "/run/mysqld/mysqld.sock",
  user: "pmclub",
  database: "pmclub",
});

let signupLink = fs.readFileSync("./public/signuplink.txt", "utf-8");

let isPOTW;
fs.readFile("potw.json", "utf-8", (err, buf) => {
  isPOTW = JSON.parse(buf).potw;
});

/* AUTHENTICATION */

const session = require("express-session");
const passport = require("passport");

const LocalStrategy = require("passport-local-token").Strategy;
const SamlStrategy = require("passport-saml").Strategy;

app.use(
  session({
    secret: process.env.SESSION_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

const authUser = (user, done) => {
  return done(null, user);
};

const verifyBackdoor = (token, done) => {
  try {
    const pass = fs
      .readFileSync("backdoor_password.txt", "utf-8")
      .split("\n")[0];
    const encoder = new TextEncoder();
    if (!crypto.timingSafeEqual(encoder.encode(token), encoder.encode(pass))) {
      return done(null, false);
    }
    return done(null, { nameID: "__root" });
  } catch (e) {
    logger.info("Failed to read file:");
    logger.info(e);
    return done(null, false);
  }
};

const idpCert = process.env.CSC_IDP_CERT;
const spCert = process.env.PMC_ADFS_CERT;
const spKey = process.env.PMC_ADFS_KEY;

const samlStrategy = new SamlStrategy(
  {
    callbackUrl: "https://puremath.club/saml/postResponse",
    entryPoint: "https://csclub.uwaterloo.ca/keycloak/saml/sso",
    issuer: "https://puremath.club",
    privateKey: spKey,
    identifierFormat: null,
    signatureAlgorithm: "sha256",
    cert: idpCert,
  },
  authUser,
);
passport.use(samlStrategy);

const localStrategy = new LocalStrategy(verifyBackdoor);
passport.use(localStrategy);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

app.post(
  "/saml/postResponse",
  bodyParser.urlencoded({ extended: false }),
  passport.authenticate("saml", { failureRedirect: "/", failureFlash: true }),
  (req, res) => {
    const dest = "/";
    if (req.session.reqUrl) {
      dest = req.session.reqUrl;
      req.session.reqUrl = null;
    }
    logger.info(
      `${req.user.nameID} (${req.headers["x-forwarded-for"]}) logged in, redirecting to ${dest}`,
    );
    res.redirect(dest);
  },
);

app.get("/metadata", (req, res) => {
  res.type("application/xml");
  res.send(samlStrategy.generateServiceProviderMetadata(null, spCert));
});

app.get(
  "/login",
  passport.authenticate("saml", { failureRedirect: "/", failureFlash: true }),
  (req, res) => {
    res.redirect("/");
  },
);

const getStatus = async (req) => {
  if (!req.user?.nameID) {
    return 0;
  }
  const mysqlAwait = require("mysql2/promise");
  const conn = await mysqlAwait.createConnection({
    database: "pmclub",
    user: "pmclub",
    socketPath: "/run/mysqld/mysqld.sock",
  });
  const [rows, fields] = await conn.execute(
    "SELECT * FROM pmclub.execs WHERE nameID=?",
    [req.user.nameID],
  );
  conn.end();
  if (rows.length > 0 || req.user.nameID === "__root") {
    return 2;
  } else {
    return 1;
  }
};

const checkAuthenticated = async (req, res, next) => {
  if (req.isAuthenticated()) {
    logger.info(
      `${req.user.nameID} (${req.headers["x-forwarded-for"]}) made HIGH protected page request: ${req.originalUrl}`,
    );
    if ((await getStatus(req)) === 2) {
      logger.info("...this user is an exec");
      return next();
    } else {
      logger.info("...this user is not an exec");
      res.redirect("/");
    }
  } else {
    logger.info(
      `${req.headers["x-forwarded-for"]} tried accessing HIGH protected page without login: ${req.originalUrl}`,
    );
    req.session.reqUrl = req.originalUrl; // Create session value with requested URL
    res.redirect("/login");
  }
};

const checkLoggedIn = async (req, res, next) => {
  if (req.isAuthenticated()) {
    logger.info(
      `${req.user.nameID} (${req.headers["x-forwarded-for"]} made LOW protected page request: ${req.originalUrl}`,
    );
    return next();
  } else {
    logger.info(
      `${req.headers["x-forwarded-for"]} tried accessing LOW protected page without login: ${req.originalUrl}`,
    );
    req.session.reqUrl = req.originalUrl; // Create session value with requested URL
    res.redirect("/login");
  }
};

/* /AUTHENTICATION */

app.get("/dashboard", checkAuthenticated, (req, res) => {
  connection.query(
    "SELECT * FROM pmclub.potw ORDER BY date",
    (err, rows, fields) => {
      if (err) throw err;
      connection.query("SELECT * FROM pmclub.execs", (err3, rows3, fields3) => {
        if (err3) throw err3;
        connection.query(
          "SELECT * FROM pmclub.courses ORDER BY id",
          (err4, rows4, fields4) => {
            if (err4) throw err4;
            res.render("dashboard", {
              name: req.user.nameID,
              execs: rows3,
              loginStatus: 2,
              potws: rows,
              courses: rows4,
              isPOTW,
              result: req.query.res,
            });
          },
        );
      });
    },
  );
});

app.get("/backdoor", async (req, res) => {
  res.render("backdoor", { loginStatus: await getStatus(req), isPOTW });
});

app.post(
  "/backdoor",
  passport.authenticate("token", { failureRedirect: "/" }),
  (req, res) => {
    logger.info(`${req.headers["x-forwarded-for"]} logged in as root`);
    res.redirect("/");
  },
);

const handleError = async (err, res) => {
  res.status(500).render("error", {
    loginStatus: await getStatus(req),
    error: "500",
    isPOTW,
  });
};

app.post(
  "/new_event",
  upload.single("image"),
  checkAuthenticated,
  (req, res) => {
    if (req.body.id === "") {
      // new event
      connection.query(
        "INSERT INTO pmclub.events (title,descr,date,begin,end,loc,body) VALUES (?,?,?,?,?,?,?)",
        [
          req.body.title,
          req.body.descr,
          req.body.date,
          req.body.begin,
          req.body.end,
          req.body.loc,
          req.body.body,
        ],
        (err, rows, fields) => {
          if (err) throw err;
          logger.info(`${req.user.nameID} added new event`);
          res.redirect("/dashboard?res=eventsuccess#create-event");
          return;
        },
      );
    } else {
      connection.query(
        "REPLACE INTO pmclub.events (id,title,descr,date,begin,end,loc,body) VALUES (?,?,?,?,?,?,?,?)",
        [
          req.body.id,
          req.body.title,
          req.body.descr,
          req.body.date,
          req.body.begin,
          req.body.end,
          req.body.loc,
          req.body.body,
        ],
        (err, rows, fields) => {
          if (err) throw err;
          logger.info(`${req.user.nameID} edited event ${req.body.id}`);
          res.redirect("/dashboard?res=eventsuccess#create-event");
          return;
        },
      );
    }
    return; // ??? this is necessary for some reason
  },
);
app.post(
  "/new_potw",
  upload.single("image"),
  checkAuthenticated,
  (req, res) => {
    if (typeof req.file === "undefined") {
      if (req.body.id == "") {
        connection.query(
          "INSERT INTO pmclub.potw (title,date,body,imgpath) VALUES (?,?,?,?)",
          [req.body.title, req.body.date, req.body.body, null],
          (err, rows, fields) => {
            if (err) throw err;
            logger.info(`${req.user.nameID} added new POTW (no image)`);
          },
        );
      } else {
        connection.query(
          "SELECT imgpath FROM pmclub.potw WHERE id=?",
          [req.body.id],
          (err, rows, fields) => {
            //return next();
            if (err) throw err;
            connection.query(
              "REPLACE INTO pmclub.potw(id,title,date,body,imgpath) VALUES (?,?,?,?,?)",
              [
                req.body.id,
                req.body.title,
                req.body.date,
                req.body.body,
                rows[0].imgpath,
              ],
              (err, rows, fields) => {
                if (err) throw err;
                logger.info(
                  `${req.user.nameID} edited POTW ${req.body.id} (no image change)`,
                );
              },
            );
          },
        );
      }
      res.redirect("/dashboard?res=potwsuccess#create-potw");
      return;
    }
    const tempPath = req.file.path;
    const rand = Math.floor(Math.random() * 999999);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const targetPath = path.join(
      __dirname,
      `./public/img/potw/${req.body.date}-${rand}${ext}`,
    );
    const isNew = req.body.id === "";
    if (ext === ".png" || ext === ".jpg") {
      fs.rename(tempPath, targetPath, (err) => {
        if (err) return handleError(err, res);
        if (!isNew) {
          // delete existing image; we're replacing it
          connection.query(
            "SELECT imgpath FROM pmclub.potw WHERE id=?",
            [req.body.id],
            (err, rows, fields) => {
              if (err) throw err;
              fs.unlink(
                path.join(__dirname, `./public/img/potw/${rows[0].imgpath}`),
                (err) => {
                  if (err) return handleError(err, res);
                },
              );
              logger.info(`Deleted old POTW image ${rows[0].imgpath}`);
            },
          );
        }
        connection.query(
          `REPLACE INTO pmclub.potw (${isNew ? "" : "id,"}title,date,body,imgpath) VALUES (${isNew ? "" : "?,"}?,?,?,?)`,
          (isNew ? [] : [req.body.id]).concat([
            req.body.title,
            req.body.date,
            req.body.body,
            `${req.body.date}-${rand}${ext}`,
          ]),
          (err, rows, fields) => {
            if (err) throw err;
            if (isNew)
              logger.info(`${req.user.nameID} added new POTW (with image)`);
            else
              logger.info(
                `${req.user.nameID} edited POTW ${req.body.id} (with image change)`,
              );
          },
        );
        res.redirect("/dashboard?res=potwsuccess#create-potw");
      });
    } else {
      fs.unlink(tempPath, (err) => {
        if (err) return handleError(err, res);
        res.redirect(403, "/dashboard?res=badfile#create-potw");
      });
    }
  },
);

app.post("/delete_event", checkAuthenticated, (req, res) => {
  // This is really bad, I'm sorry lol
  const del_id = Object.keys(JSON.parse(JSON.stringify(req.body)))[0];
  logger.info(`${req.user.nameID} deleting event ${del_id}`);
  connection.query(
    "DELETE FROM pmclub.events WHERE id = ?",
    [del_id],
    (err, rows, fields) => {
      if (err) throw err;
    },
  );
  res.redirect("/dashboard?res=eventdeleted#create-event");
});

app.post("/delete_potw", checkAuthenticated, (req, res) => {
  const del_ids = Object.keys(JSON.parse(JSON.stringify(req.body)));
  // delete potw in db
  if (del_ids.length > 0) {
    connection.query(
      `SELECT * FROM pmclub.potw WHERE id IN (${del_ids.toString()}) ORDER BY date`,
      (err, rows, fields) => {
        if (err) throw err;
        for (let i = 0; i < rows.length; ++i) {
          logger.info(
            `${req.user.nameID} deleting POTW ${del_ids[i]} and image ${rows[i].imgpath}`,
          );
          if (rows[i].imgpath !== null) {
            fs.unlink(
              path.join(__dirname, `./public/img/potw/${rows[i].imgpath}`),
              (err2) => {
                if (err2) return handleError(err2, res);
              },
            );
          }
        }
      },
    );
    connection.query(
      `DELETE FROM pmclub.potw WHERE id IN (${del_ids.toString()})`,
      (err, rows, fields) => {
        if (err) throw err;
      },
    );
    res.redirect("/dashboard?res=potwdeleted#create-potw");
  } else {
    res.redirect("/dashboard?res=noselect#create-potw");
  }
});

app.post("/update_courses", checkAuthenticated, (req, res) => {
  /*const date = Date.now();
  fs.copyFile('public/courses.md', `public/course-${date}.md`, (err) => {
    if (err) throw err;
    console.log(`${date}: Backed up the current course list`)
  })
  fs.writeFile('public/courses.md', req.body.courses, (err) => {
    if (err) throw err;
    console.log(`${date}: Updated the course list`)
  })*/
  connection.query(
    "UPDATE pmclub.courses set body = ? WHERE id = " + req.body.subjectId,
    [req.body.courses],
    (err, rows, fields) => {
      if (err) throw err;
    },
  );
  res.redirect("/dashboard?res=courseupd#course-list");
});

app.post("/update_execs", checkAuthenticated, (req, res) => {
  logger.info(`${req.user.nameID} attempted to modify execs`);
  // Disallow self-removal
  if (
    req.user.nameID !== "__root" &&
    !req.body.formexecs.includes(req.user.nameID)
  ) {
    res.redirect("/dashboard?res=execfail#update-execs");
    return;
  }
  logger.info(
    `${req.user.nameID} changed exec list to ${req.body.formexecs.toString()}`,
  );
  connection.query("DELETE FROM pmclub.execs", (err, rows, fields) => {
    if (err) throw err;
  });
  let query = "INSERT INTO pmclub.execs VALUES ";
  for (let i = 0; i < req.body.formexecs.length; ++i) {
    query += "(?),";
  }
  query = query.substring(0, query.length - 1);
  connection.query(query, req.body.formexecs);
  res.redirect("/dashboard?res=execupd#update-execs");
});

app.post("/update_signup", checkAuthenticated, (req, res) => {
  const date = Date.now();
  fs.writeFile("./public/signuplink.txt", req.body.signup, (err) => {
    if (err) throw err;
    logger.info(
      `${req.user.nameID} updated the sign-up link to ${req.body.signup}`,
    );
    signupLink = req.body.signup;
  });
  res.redirect("/dashboard?res=signupupd#update-signup");
});

app.get("/signup", (req, res) => {
  res.redirect(signupLink);
}) /
  app.post("/update_const", checkAuthenticated, (req, res) => {
    const date = Date.now();
    fs.copyFile("public/pmc.const.md", `public/pmc-${date}.const.md`, (err) => {
      if (err) throw err;
      logger.info(`Backed up the current constitution as ${date}`);
    });
    fs.writeFile("public/pmc.const.md", req.body.constitution, (err) => {
      if (err) throw err;
      logger.info(`${req.user.nameID} updated the constitution`);
    });
    res.redirect("/dashboard?res=constupd#update-const");
  });

app.post("/query_events", checkAuthenticated, (req, res) => {
  const { term, year } = req.body;
  const start = term === "winter" ? 1 : term === "spring" ? 5 : 9;
  connection.query(
    `SELECT * FROM pmclub.events WHERE YEAR(date) = ${year} AND MONTH(date) >= ${start} AND MONTH(date) <= ${start + 3}`,
    (err, rows, fields) => {
      if (err) throw err;
      res.json(rows);
    },
  );
});

app.post("/toggle_potw", checkAuthenticated, (req, res) => {
  isPOTW = !isPOTW;
  fs.writeFileSync("potw.json", JSON.stringify({ potw: isPOTW }));
  res.redirect(`/dashboard?res=potw${isPOTW ? "en" : "dis"}abled#create-potw`);
});

app.get("/logout", (req, res, next) => {
  if (req.user?.nameID) {
    logger.info(`${req.user.nameID} logged out`);
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  } else {
    res.redirect("/");
  }
});

app.set("view engine", "pug");
app.set("views", path.join(__dirname, "/views"));

app.get("/", (req, res) => {
  connection.query(
    "SELECT * FROM pmclub.events WHERE date >= CURDATE() ORDER BY date DESC LIMIT 3",
    async (err, rows, fields) => {
      if (err) throw err;
      if (isPOTW) {
        connection.query(
          "SELECT * FROM pmclub.potw ORDER BY date DESC",
          async (err3, rows3, fields3) => {
            if (err3) throw err3;
            res.render("index", {
              loginStatus: await getStatus(req),
              posts: rows,
              potws: rows3,
              isPOTW: isPOTW,
            });
          },
        );
      } else {
        res.render("index", {
          loginStatus: await getStatus(req),
          posts: rows,
          isPOTW: isPOTW,
        });
      }
    },
  );
});

app.get("/about", async (req, res) => {
  res.render("about", { loginStatus: await getStatus(req), isPOTW: isPOTW });
});

Date.prototype.yyyymmdd = function () {
  const mm = this.getMonth() + 1; // getMonth() is zero-based
  const dd = this.getDate();

  return [
    this.getFullYear(),
    (mm > 9 ? "" : "0") + mm,
    (dd > 9 ? "" : "0") + dd,
  ].join("");
};
const getTerm = (date) => {
  // date given as yyyy-mm-dd
  const month = parseInt(date.slice(4, 6));
  return (month < 5 ? "w" : month < 9 ? "s" : "f") + date.slice(2, 4);
};
app.get("/events/calendar", (req, res) => {
  connection.query(
    "SELECT * FROM pmclub.events WHERE date >= CURDATE()",
    (err, rows, fields) => {
      if (err) throw err;
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="calendar.ics"',
      );

      const cal = new ICalCalendar({
        name: "PMC Events",
        prodId: "//PMC//puremath.club//EN",
      });

      rows.forEach((event) => {
        const eventStart = new Date(event.date);
        const eventEnd = new Date(event.date);

        const startTime = event.begin.split(":");
        eventStart.setHours(startTime[0]);
        eventStart.setMinutes(startTime[1]);

        const endTime = event.end.split(":");
        eventEnd.setHours(endTime[0]);
        eventEnd.setMinutes(endTime[1]);

        cal.createEvent({
          start: eventStart,
          end: eventEnd,
          summary: event.title,
          title: event.title,
          description: event.body,
          location: event.loc,
          // todo: url: "http://sebbo.net/",
        });
      });

      res.status(200).send(cal.toString());
    },
  );
  //res.render('events')
});
// Redirect to most recent term
app.get("/events", (req, res) => {
  connection.query(
    "SELECT * FROM pmclub.events ORDER BY date DESC LIMIT 1",
    (err, rows, fields) => {
      if (err) throw err;
      if (rows.length == 0) {
        return handleError(err, res);
      }
      res.redirect(`/events/${getTerm(rows[0].date.yyyymmdd())}`);
    },
  );
  //res.render('events')
});
app.get("/const", async (req, res) => {
  fs.readFile("public/pmc.const.md", "utf-8", async (err, buf) => {
    const converter = new showdown.Converter();
    res.render("const", {
      loginStatus: await getStatus(req),
      isPOTW: isPOTW,
      constitution: converter.makeHtml(buf),
    });
  });
});
app.get("/courses", (req, res) => {
  /*
  fs.readFile("public/courses.md", "utf-8", (err, buf) => {
    const converter = new showdown.Converter();
    res.render('courses', { isPOTW: isPOTW, courses: converter.makeHtml(buf) });
  });
  */
  connection.query(
    "SELECT * FROM pmclub.courses ORDER BY id",
    async (err, rows, fields) => {
      const converter = new showdown.Converter();
      res.render("courses", {
        loginStatus: await getStatus(req),
        isPOTW: isPOTW,
        courses: rows.map((i) => ({ ...i, body: converter.makeHtml(i.body) })),
      });
    },
  );
});
/*
app.get('/sasms', async (req, res) => {
  connection.query('SELECT * FROM pmclub.sasms ORDER BY time', async (err, rows, fields) => {
    res.render('sasms', { loginStatus: await getStatus(req), isPOTW: isPOTW, sasms: rows });
  });
});
*/
app.get("/history", async (req, res) => {
  res.render("history", { loginStatus: await getStatus(req), isPOTW: isPOTW });
});

app.get("/library", async (req, res) => {
  res.render("library", { loginStatus: await getStatus(req), isPOTW: isPOTW });
});

const getIneq = (term) => {
  let str = "20" + term.slice(1, 3) + "-0";
  if (term[0] == "w") {
    str += "1";
  }
  if (term[0] == "s") {
    str += "5";
  }
  if (term[0] == "f") {
    str += "9";
  }
  str += "-01' AND date <= '20" + term.slice(1, 3) + "-";
  if (term[0] == "w") {
    str += "04-30";
  }
  if (term[0] == "s") {
    str += "08-31";
  }
  if (term[0] == "f") {
    str += "12-31";
  }
  return str;
};

app.get("/events/:term", async (req, res) => {
  const t = req.params.term;
  if (
    t.length != 3 ||
    (t[0] != "w" && t[0] != "s" && t[0] != "f") ||
    isNaN(parseInt(t[1])) ||
    isNaN(parseInt(t[2]))
  ) {
    res.status(404);
    res.render("error", {
      loginStatus: await getStatus(req),
      error: "404",
      isPOTW: isPOTW,
    });
    return;
  }
  connection.query(
    `SELECT * FROM pmclub.events WHERE date >= '${getIneq(req.params.term)}' ORDER BY date DESC`,
    async (err, rows, fields) => {
      if (err) throw err;
      const converter = new showdown.Converter();
      res.render("event", {
        loginStatus: await getStatus(req),
        posts: rows.map((i) => ({ ...i, body: converter.makeHtml(i.body) })),
        reqTerm: req.params.term,
        isPOTW: isPOTW,
      });
    },
  );
});

app.get("/potw", async (req, res) => {
  if (!isPOTW) {
    res.status(404);
    res.render("error", {
      loginStatus: await getStatus(req),
      error: "404",
      isPOTW: isPOTW,
    });
    return;
  }
  connection.query(
    "SELECT * FROM pmclub.potw ORDER BY date DESC",
    async (err, rows, fields) => {
      if (err) throw err;
      const converter = new showdown.Converter();
      res.render("potw", {
        loginStatus: await getStatus(req),
        potws: rows.map((i) => ({ ...i, body: converter.makeHtml(i.body) })),
        isPOTW: isPOTW,
      });
    },
  );
});

app.use("/static", express.static("public"));
app.use("/files", checkLoggedIn);
app.use(
  "/files",
  checkLoggedIn,
  express.static("/authfiles"),
  serveIndex("authfiles", { icons: true }),
  serveStatic("authfiles"),
);

app.get("/history", async (req, res) => {
  res.render("history", { loginStatus: await getStatus(req), isPOTW: isPOTW });
});

app.use(async (req, res, next) => {
  res.status(404);
  res.render("error", {
    loginStatus: await getStatus(req),
    error: "404",
    isPOTW: isPOTW,
  });
});

app.use(async (err, req, res, next) => {
  res.status(500);
  logger.info(err);
  res.render("error", {
    loginStatus: await getStatus(req),
    error: "500",
    isPOTW: isPOTW,
  });
});

const server = app.listen(port, () => {
  logger.info("");
  logger.info("THE PURE MATH, APPLIED MATH, COMBINATORICS & OPTIMIZATION CLUB");
  logger.info("Website written by Evan Girardin (evangirardin@gmail.com)");
  logger.info("---");
  logger.info(`Static directory: ${path.join(__dirname, "/public")}`);
  logger.info(`Listening on port ${port}`);
  logger.info("");
});

const shutdown = () => {
  logger.info("Kill signal received -- shutting down now");
  server.close(() => {
    connection.end();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
