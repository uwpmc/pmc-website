const express = require('express')
const app = express()
const port = 80
const multer = require('multer')

const path = require('path')
const fs = require('fs')
var bodyParser = require('body-parser')
var showdown  = require('showdown')

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

const upload = multer({
    dest: path.join(__dirname, "./public/img/temp")
});

const mysql = require('mysql')
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1q2w3e!Q@W#Ebulcmp',
  database: 'pmc'
})

var isPOTW;

fs.readFile("potw.json", "utf-8", (err, buf) => {
  isPOTW = JSON.parse(buf).potw;
})


/* OAUTH WORK */

const session = require('express-session')
const passport = require('passport')

const GoogleStrategy = require( 'passport-google-oauth2' ).Strategy;

//Middleware
app.use(session({
    secret: "secret",
    resave: false ,
    saveUninitialized: true ,
}))

app.use(passport.initialize()) // init passport on every route call
app.use(passport.session())    //allow passport to use "express-session"

const GOOGLE_CLIENT_ID =
"407152582406-ad0u942n6550ctlh4852hm26qss44t4r.apps.googleusercontent.com"
const GOOGLE_CLIENT_SECRET="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"

authUser = (request, accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }

passport.use(new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost/auth/google/callback",
    passReqToCallback   : true
  }, authUser));

passport.serializeUser( (user, done) => {
   done(null, user)
})

passport.deserializeUser((user, done) => {
  done (null, user)
})

//Middleware to see how the params are populated by Passport
let count = 1
showlogs = (req, res, next) => {
    console.log("\n==============================")
    console.log(`------------>  ${count++}`)

    console.log(`\n req.session.passport -------> `)
    console.log(req.session.passport)

    console.log(`\n req.user -------> `)
    console.log(req.user)

    console.log("\n Session and Cookie")
    console.log(`req.session.id -------> ${req.session.id}`)
    console.log(`req.session.cookie -------> `)
    console.log(req.session.cookie)

    console.log("===========================================\n")

    next()
}

//app.use(showlogs) //user printData function as middleware to print populated variables

app.get('/auth/google',
  passport.authenticate('google', { scope:
      [ 'email', 'profile' ] }
));

app.get('/auth/google/callback',
    passport.authenticate( 'google', {
        successRedirect: '/dashboard',
        failureRedirect: '/login'
}));

//Define the Login Route
app.get("/login", (req, res) => {
    if (req.isAuthenticated()) { res.redirect('dashboard') }
    else { res.render("login", {isPOTW: isPOTW}) }
})


//Use the req.isAuthenticated() function to check if user is Authenticated
checkAuthenticated = (req, res, next) => {/*
  if (req.isAuthenticated() && req.user.email=='pmclub@gmail.com') { return next() }
  if (req.isAuthenticated()) {
    req.logOut();
    res.redirect("/login")
    console.log('------> Logged out bad user')
  }
  else { res.redirect("login") }*/
  return next()
}

//Define the Protected Route, by using the "checkAuthenticated" function defined above as middleware
app.get("/dashboard", checkAuthenticated, (req, res) => {
  connection.query("SELECT * FROM pmc.potw ORDER BY date", (err, rows, fields) => {
    if (err) throw err;
    res.render("dashboard", {name: /*req.user.displayName*/ 'PMC', potws: rows, isPOTW: isPOTW});
  })
})

const handleError = (err, res) => {
  res
    .status(500)
    .render('error', {isPOTW: isPOTW});
}

app.post("/new_event", upload.single("image"), checkAuthenticated, (req, res) => {
  if (typeof req.file === 'undefined') {
    connection.query("INSERT INTO pmc.events ( type, title, descr, date, begin, end, loc, body, imgpath ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body, 'NULL'], (err, rows, fields) => {
      if (err) throw err;
      console.log('New event added (no image)')
    })
    res.redirect('/dashboard')
    return
  }
  const tempPath = req.file.path;
  const rand = Math.floor(Math.random()*999999);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const targetPath = path.join(__dirname, "./public/img/events/"+req.body.date+'-'+rand+ext);
  console.log(tempPath)
  console.log(targetPath)
  if (ext === ".png" || ext === ".jpg") {
    fs.rename(tempPath, targetPath, err => {
      if (err) return handleError(err, res);
      connection.query("INSERT INTO pmc.events ( type, title, descr, date, begin, end, loc, body, imgpath ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body, req.body.date+'-'+rand+ext], (err, rows, fields) => {
        if (err) throw err;
        console.log('New event added (with image)')
      })
      res.redirect('/dashboard')
    });
  } else {
    fs.unlink(tempPath, err => {
      if (err) return handleError(err, res);
      res
        .status(403)
        .contentType("text/plain")
        .end("Only .png and .jpg files are allowed!");
    });
  }
})
app.post("/new_potw", upload.single("image"), checkAuthenticated, (req, res) => {
  if (typeof req.file === 'undefined') {
    connection.query("INSERT INTO pmc.potw ( title, date, body, imgpath ) VALUES (?, ?, ?, ?)", [req.body.title, req.body.date, req.body.body, 'NULL'], (err, rows, fields) => {
      if (err) throw err;
      console.log('New POTW added (no image)')
    })
    res.redirect('/dashboard')
    return
  }
  const tempPath = req.file.path;
  const rand = Math.floor(Math.random()*999999);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const targetPath = path.join(__dirname, "./public/img/potw/"+req.body.date+'-'+rand+ext);
  console.log(tempPath)
  console.log(targetPath)
  if (ext === ".png" || ext === ".jpg") {
    fs.rename(tempPath, targetPath, err => {
      if (err) return handleError(err, res);
      connection.query("INSERT INTO pmc.potw ( title, date, body, imgpath ) VALUES (?, ?, ?, ?)", [req.body.title, req.body.date, req.body.body, req.body.date+'-'+rand+ext], (err, rows, fields) => {
        if (err) throw err;
        console.log('New POTW added (with image)')
      })
      res.redirect('/dashboard')
    });
  } else {
    fs.unlink(tempPath, err => {
      if (err) return handleError(err, res);
      res
        .status(403)
        .contentType("text/plain")
        .end("Only .png and .jpg files are allowed!");
    });
  }
})

app.post("/delete_event", checkAuthenticated, (req, res) => {
  // This is really bad, I'm sorry lol
  const del_id = Object.keys(JSON.parse(JSON.stringify(req.body)))[0];
  // delete associated image
  connection.query("SELECT * FROM pmc.events WHERE id = '" + del_id + "'", (err, rows, fields) => {
    if (err) throw err;
    console.log('Deleting event ' + del_id + ' and image ' + rows[0].imgpath)
    if (rows[0].imgpath !== null) {
      fs.unlink(path.join(__dirname, "./public/img/events/"+rows[0].imgpath), err2 => {
        if (err2) return handleError(err2, res);
      });
    }
  })
  // delete event in db
  connection.query("DELETE FROM pmc.events WHERE id = '" + del_id + "'", (err, rows, fields) => {
    if (err) throw err;
  })
  res.redirect("/dashboard")
})

app.post("/delete_potw", checkAuthenticated, (req, res) => {
  const del_ids = Object.keys(JSON.parse(JSON.stringify(req.body)));
  console.log(del_ids);
  // delete potw in db
  if (del_ids.length > 0) {
    connection.query("SELECT * FROM pmc.potw WHERE id IN (" + del_ids.toString() + ") ORDER BY date", (err, rows, fields) => {
      if (err) throw err;
      for (var i = 0; i < rows.length; ++i) {
        console.log('Deleting POTW ' + del_ids[i] + ' and image ' + rows[i].imgpath)
        if (rows[i].imgpath !== null) {
          fs.unlink(path.join(__dirname, "./public/img/potw/"+rows[i].imgpath), err2 => {
            if (err2) return handleError(err2, res);
          });
        }
      }
    })
    connection.query("DELETE FROM pmc.potw WHERE id IN (" + del_ids.toString() + ")", (err, rows, fields) => {
      if (err) throw err;
    })
  }
  res.redirect("/dashboard")
})

app.post("/query_events", checkAuthenticated, (req, res) => {
  const { search } = req.body;
  console.log(search);
  connection.query("SELECT * FROM pmc.events WHERE date = '" + search + "'", (err, rows, fields) => {
    if (err) throw err;
    console.log(search);
    console.log(rows);
    res.json(rows);
  })
})

app.post("/enable_potw", checkAuthenticated, (req, res) => {
  isPOTW = true;
  fs.writeFileSync('potw.json', JSON.stringify({potw: true}))
  res.redirect("/dashboard")
})

app.post("/disable_potw", checkAuthenticated, (req, res) => {
  isPOTW = false;
  fs.writeFileSync('potw.json', JSON.stringify({potw: false}))
  res.redirect("/dashboard")
})

app.get("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(`-------> User Logged out`)
})
//Define the Logout
app.post("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(`-------> User Logged out`)
})

/* /OAUTH WORK */

app.use(express.static('public'));

console.log('Static directory '+path.join(__dirname, '/public'));

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.get('/', (req, res) => {
  connection.query('SELECT * FROM pmc.events ORDER BY date DESC LIMIT 3', (err, rows, fields) => {
    if (err) throw err
    if (isPOTW) {
      connection.query('SELECT * FROM pmc.potw ORDER BY date DESC', (err2, rows2, fields2) => {
        if (err2) throw err2
        res.render('index', { posts: rows, potws: rows2, isPOTW: isPOTW });
      })
    } else {
      res.render('index', { posts: rows, isPOTW: isPOTW });
    }
  });
});
app.get('/about', (req, res) => {
  res.render('about', { isPOTW: isPOTW })
});

Date.prototype.yyyymmdd = function() {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [this.getFullYear(),
          (mm>9 ? '' : '0') + mm,
          (dd>9 ? '' : '0') + dd
          ].join('');
        };
function getTerm(date) {
  // date given as yyyy-mm-dd
  let month = parseInt(date.slice(4,6));
  return (month < 5 ? 'w' : (month < 9 ? 's' : 'f')) + date.slice(2,4);
}
// Redirect to most recent term
app.get('/events', (req, res) => {
  connection.query('SELECT * FROM pmc.events ORDER BY date DESC LIMIT 1', (err, rows, fields) => {
    if (err) throw err
    res.redirect('/events/' + getTerm(rows[0].date.yyyymmdd()))
  });
  //res.render('events')
});
app.get('/const', (req, res) => {
  res.render('const', { isPOTW: isPOTW })
});

function getIneq(term) {
  var str = "20" + term.slice(1,3) + '-0'
  if (term[0] == 'w') { str += '1' }
  if (term[0] == 's') { str += '5' }
  if (term[0] == 'f') { str += '9' }
  str += ("-01' AND date <= '20" + term.slice(1,3)) + '-'
  if (term[0] == 'w') { str += "04-30" }
  if (term[0] == 's') { str += "08-31" }
  if (term[0] == 'f') { str += "12-31" }
  return str;
}

app.get('/events/:term', (req, res) => {
  const t = req.params.term;
  if (t.length != 3 || (t[0] != 'w' && t[0] != 's' && t[0] != 'f') || isNaN(parseInt(t[1])) || isNaN(parseInt(t[2]))) {
    res.status(404);
    res.render('error', { isPOTW: isPOTW });
    return;
  }
  connection.query("SELECT * FROM pmc.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date DESC", (err, rows, fields) => {
    //console.log(req.params.term)
    //console.log("SELECT * FROM pmc.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date")
    for (var i = 0; i < rows.length; ++i) {
      //console.log(rows)
      var converter = new showdown.Converter();
      rows[i].body = converter.makeHtml(rows[i].body);
    }
    res.render('event', { posts: rows, reqTerm: req.params.term, isPOTW: isPOTW })
  });
});

app.get('/potw', (req, res) => {
  if (!isPOTW) {
    res.status(404);
    res.render('error', { error: '404', isPOTW: isPOTW });
    return;
  }
  connection.query("SELECT * FROM pmc.potw ORDER BY date DESC", (err, rows, fields) => {
    for (var i = 0; i < rows.length; ++i) {
      var converter = new showdown.Converter();
      rows[i].body = converter.makeHtml(rows[i].body);
    }
    res.render('potw', { potws: rows, isPOTW: isPOTW })
  });
});


app.use(function(req, res, next) {
  res.status(404);
  res.render('error', {error: '404', isPOTW: isPOTW});
});

app.use(function(err, req, res, next) {
  res.status(500);
  console.log(err);
  res.render('error', {error: '500', isPOTW: isPOTW});
});

app.listen(port, '192.168.2.46', () => {
    console.log(`Listening on port ${port}`)
})
