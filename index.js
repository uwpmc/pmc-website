// THE PURE MATH, APPLIED MATH, COMBINATORICS & OPTIMIZAITON CLUB WEBSITE
// Written with love by Evan Girardin, W22/S22 PMC President
// Please direct all compliments and hate mail to evangirardin at gmail dot com

const express = require('express')
const app = express()
const port = 3000
const multer = require('multer')

const path = require('path')
const fs = require('fs')
var bodyParser = require('body-parser')
var showdown  = require('showdown')

// Showdown extension to wrap images in containers
var imgWrapper = function(converter) {
  return [
    {
      type: 'output',
      regex: '<img (.*)/>',
      replace: '<div class="imgContainer"><img $1></div>'
    }
  ];
}
showdown.extension('imgWrapper', imgWrapper)

/*
  Showdown extension for doing HTML details/summary
  This is probably fragile, so don't get too cute with it :P
  SYNTAX:
    :> (summary)
    (details -- this can span many lines)
    <:
*/
var hidden = function(converter) {
  return [
    {
      type: 'lang',
      filter: function (text, converter, options) {
        var mainRegex = new RegExp("(^:>(.*\n)*?(<:\n))", "gm");
        text = text.replace(mainRegex, function(match, content) {
          var summary = content.split('\n')[0].replace(/^([ \t]*):>([ \t])?/gm, ""); // only first line
          var details = content.replace(/^([ \t]*):>([ \t])?.*\n/gm, "").replace(/^<:\n/gm, ""); // remove first line, <:
          var foo = converter.makeHtml(summary);
          var bar = converter.makeHtml(details);
          return '\n<details><summary>' + foo.slice(3).slice(0,-4) + '</summary>\n' + bar + '</details>\n';
          // Note: I do the slice stuff to get rid of the <p> and </p> which
          //   I am assuming wrap it. Don't do anything funny here or it'll break.
        });
        return text;
      }
    }
  ];
}
showdown.extension('hidden', hidden)

showdown.setOption('extensions', [hidden, imgWrapper]);
showdown.setOption('tables', true);
showdown.setOption('simpleLineBreaks', true);
showdown.setOption('emoji', true);
showdown.setOption('tasklists', true)
showdown.setOption('simplifiedAutoLink', true)
showdown.setOption('strikethrough', true)

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

const upload = multer({
    dest: path.join(__dirname, "./public/img/temp")
});

const mysql = require('mysql2')
const connection = mysql.createConnection({
  socketPath: '/run/mysqld/mysqld.sock',
  user: 'pmclub',
  database: 'pmclub'
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
    callbackURL: "https://puremath.club/auth/google/callback",
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
    })
);

//Define the login route
app.get("/login", (req, res) => {
    if (req.isAuthenticated()) { res.redirect('dashboard') }
    else { res.render("login", {isPOTW: isPOTW}) }
})


//Use the req.isAuthenticated() function to check if user is Authenticated
checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && req.user.email=='pmclub@gmail.com') { return next() }
  if (req.isAuthenticated()) {
    req.logOut();
    res.redirect("/login")
    console.log('------> Logged out bad user')
  }
  else { res.redirect("login") }
}

//Define the Protected Route, by using the "checkAuthenticated" function defined above as middleware
app.get("/dashboard", checkAuthenticated, (req, res) => {
  connection.query("SELECT * FROM pmclub.potw ORDER BY date", (err, rows, fields) => {
    if (err) throw err;
    connection.query("SELECT * FROM pmclub.types ORDER BY id", (err2, rows2, fields2) => {
      if (err2) throw err2;
      connection.query("SELECT t1.id id, COUNT(t2.type) count FROM pmclub.types t1 LEFT JOIN pmclub.events t2 ON t2.type = t1.id GROUP BY t1.id", (err3, rows3, fields3) => {
        if (err3) throw err3;
        connection.query("SELECT * FROM pmclub.courses ORDER BY id", (err4, rows4, fields4) => {
          res.render("dashboard", {name: req.user.displayName, potws: rows, types: rows2, types_count: rows3, courses: rows4, isPOTW: isPOTW, result: req.query.res});
        });
      })
    })
  })
})

const handleError = (err, res) => {
  res
    .status(500)
    .render('error', {error: '500', isPOTW: isPOTW});
}

app.post("/new_type", checkAuthenticated, (req, res) => {
  console.log(req.body.ntypes);
  connection.query("SELECT COUNT(*) FROM pmclub.types", (err, rows, fields) => {
    console.log(Object.values(rows[0])[0]);
    let numTypes = Object.values(rows[0])[0];
    let numTotal = req.body.ntypes.length
    // update existing types and perform conversions
    for (let i = 0; i < numTypes; ++i) {
      // update existing types
      let cur = req.body.ntypes[i];
      connection.query("REPLACE INTO pmclub.types (id, name, fstcol, sndcol) VALUES (?, ?, ?, ?)", [cur.id, cur.typename, cur.fstcol, cur.sndcol], (err, rows, fields) => {
        if (err) throw err;
        console.log('Modified event type ' + cur.id + ', "' + cur.typename + '"')
      })

      // perform conversions
      if (cur.convert !== '-') {
        console.log('Attempting to convert events with type ' + cur.id + ' -> ' + cur.convert);
        connection.query("UPDATE pmclub.events SET type = " + cur.convert + " WHERE type = " + cur.id, (err, rows, fields) => {
          if (err) throw err;
          console.log('Converted all events of type ' + cur.id + ' to type ' + cur.convert);
        })
      }
    }
    // create new types
    for (let i = numTypes; i < numTotal; ++i) {
      let cur = req.body.ntypes[i];
      connection.query("INSERT INTO pmclub.types (name, fstcol, sndcol) VALUES (?, ?, ?)", [cur.typename, cur.fstcol, cur.sndcol], (err, rows, fields) => {
        if (err) throw err;
        console.log('Added event type "' + cur.typename + '"');
      })
    }
    res.redirect('/dashboard?res=typesuccess#create-event')
    return;
  })
})

app.post("/new_event", upload.single("image"), checkAuthenticated, (req, res) => {
  //console.log(typeof req.file);
  if (typeof req.file === 'undefined') {
    if (req.body.id === '') { // new event
      connection.query("INSERT INTO pmclub.events ( type, title, descr, date, begin, end, loc, body, imgpath ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body, null], (err, rows, fields) => {
        if (err) throw err;
        console.log('New event added (no image)')
        res.redirect('/dashboard?res=eventsuccess#create-event')
        return;
      })
    } else {
      connection.query("SELECT imgpath FROM pmclub.events WHERE id="+req.body.id, (err, rows, fields) => {
        if (err) throw err;
        connection.query("REPLACE INTO pmclub.events (id,type,title,descr,date,begin,end,loc,body,imgpath) VALUES (?,?,?,?,?,?,?,?,?,?)", [req.body.id, req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body, rows[0].imgpath], (err, rows, fields) => {
          if (err) throw err;
          console.log('Event has been edited (no image change)')
          res.redirect('/dashboard?res=eventsuccess#create-event')
          return;
        })
      })
    }
    return; // ??? this is necessary for some reason
  }
  const tempPath = req.file.path;
  const rand = Math.floor(Math.random()*999999); // better cross your fingers! ;)
  const ext = path.extname(req.file.originalname).toLowerCase();
  const targetPath = path.join(__dirname, "./public/img/events/"+req.body.date+'-'+rand+ext);
  console.log(tempPath)
  console.log(targetPath)
  const isNew = (req.body.id === '');
  if (ext === ".png" || ext === ".jpg") {
    fs.rename(tempPath, targetPath, err => {
      if (err) return handleError(err, res);
      if (!isNew) {
        // delete existing image; we're replacing it
        connection.query("SELECT imgpath FROM pmclub.events WHERE id="+req.body.id, (err, rows, fields) => {
          if (err) throw err;
          fs.unlink(path.join(__dirname, "./public/img/events/"+rows[0].imgpath), err => {
            if (err) return handleError(err, res);
          });
          console.log("Deleted old event image" + rows[0].imgpath)
        });
      }
      // looooooong!
      connection.query("REPLACE INTO pmclub.events ( "+(isNew ? "" : "id, ")+"type, title, descr, date, begin, end, loc, body, imgpath ) VALUES ("+(isNew ? "" : "?, ")+"?, ?, ?, ?, ?, ?, ?, ?, ?)", (isNew ? [] : [req.body.id]).concat([req.body.eventtype, req.body.title, req.body.descr, req.body.date, req.body.begin, req.body.end, req.body.loc, req.body.body, req.body.date+'-'+rand+ext]), (err, rows, fields) => {
        if (err) throw err;
        if (isNew) console.log('New event added (with image)')
        else console.log('Event has been edited (with image change)')
      })
      res.redirect('/dashboard?res=eventsuccess#create-event')
    });
  } else {
    fs.unlink(tempPath, err => {
      if (err) return handleError(err, res);
      res.redirect(403, '/dashboard?res=badfile#create-event')
    });
  }
})
app.post("/new_potw", upload.single("image"), checkAuthenticated, (req, res) => {
  if (typeof req.file === 'undefined') {
    if (req.body.id == '') {
      connection.query("INSERT INTO pmclub.potw ( title, date, body, imgpath ) VALUES (?, ?, ?, ?)", [req.body.title, req.body.date, req.body.body, null], (err, rows, fields) => {
        if (err) throw err;
        console.log('New POTW added (no image)')
      })
    } else {
      connection.query("SELECT imgpath FROM pmclub.potw WHERE id="+req.body.id, (err, rows, fields) => {
  //return next();
        if (err) throw err;
        connection.query("REPLACE INTO pmclub.potw(id,title,date,body,imgpath) VALUES (?,?,?,?,?)", [req.body.id, req.body.title, req.body.date, req.body.body, rows[0].imgpath], (err, rows, fields) => {
          if (err) throw err;
          console.log('POTW has been edited (no image change)')
        })
      })
    }
    res.redirect('/dashboard?res=potwsuccess#create-potw')
    return
  }
  const tempPath = req.file.path;
  const rand = Math.floor(Math.random()*999999);
  const ext = path.extname(req.file.originalname).toLowerCase();
  const targetPath = path.join(__dirname, "./public/img/potw/"+req.body.date+'-'+rand+ext);
  console.log(tempPath)
  console.log(targetPath)
  const isNew = (req.body.id === '');
  if (ext === ".png" || ext === ".jpg") {
    fs.rename(tempPath, targetPath, err => {
      if (err) return handleError(err, res);
      if (!isNew) {
        // delete existing image; we're replacing it
        connection.query("SELECT imgpath FROM pmclub.potw WHERE id="+req.body.id, (err, rows, fields) => {
          if (err) throw err;
          fs.unlink(path.join(__dirname, "./public/img/potw/"+rows[0].imgpath), err => {
            if (err) return handleError(err, res);
          });
          console.log("Deleted old POTW image " + rows[0].imgpath)
        });
      }
      connection.query("REPLACE INTO pmclub.potw ("+(isNew ? "" : "id, ")+" title, date, body, imgpath ) VALUES ("+(isNew ? "" : "?, ")+"?, ?, ?, ?)", (isNew ? [] : [req.body.id]).concat([req.body.title, req.body.date, req.body.body, req.body.date+'-'+rand+ext]), (err, rows, fields) => {
        if (err) throw err;
        if (isNew) console.log('New POTW added (with image)');
        else console.log('POTW has been edited (with image change)');
      })
      res.redirect('/dashboard?res=potwsuccess#create-potw')
    });
  } else {
    fs.unlink(tempPath, err => {
      if (err) return handleError(err, res);
      res.redirect(403, '/dashboard?res=badfile#create-potw')
    });
  }
})

app.post("/delete_event", checkAuthenticated, (req, res) => {
  // This is really bad, I'm sorry lol
  const del_id = Object.keys(JSON.parse(JSON.stringify(req.body)))[0];
  // delete associated image
  connection.query("SELECT * FROM pmclub.events WHERE id = '" + del_id + "'", (err, rows, fields) => {
    if (err) throw err;
    console.log('Deleting event ' + del_id + ' and image ' + rows[0].imgpath)
    if (rows[0].imgpath !== null) {
      fs.unlink(path.join(__dirname, "./public/img/events/"+rows[0].imgpath), err2 => {
        if (err2) return handleError(err2, res);
      });
    }
  })
  // delete event in db
  connection.query("DELETE FROM pmclub.events WHERE id = '" + del_id + "'", (err, rows, fields) => {
    if (err) throw err;
  })
  res.redirect("/dashboard?res=eventdeleted#create-event")
})

app.post("/delete_type", checkAuthenticated, (req, res) => {
  const del_id = Object.keys(JSON.parse(JSON.stringify(req.body).slice(4)))[0];
  connection.query("")
})

app.post("/delete_potw", checkAuthenticated, (req, res) => {
  const del_ids = Object.keys(JSON.parse(JSON.stringify(req.body)));
  console.log(del_ids);
  // delete potw in db
  if (del_ids.length > 0) {
    connection.query("SELECT * FROM pmclub.potw WHERE id IN (" + del_ids.toString() + ") ORDER BY date", (err, rows, fields) => {
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
    connection.query("DELETE FROM pmclub.potw WHERE id IN (" + del_ids.toString() + ")", (err, rows, fields) => {
      if (err) throw err;
    })
    res.redirect("/dashboard?res=potwdeleted#create-potw")
  } else {
    res.redirect("/dashboard?res=noselect#create-potw")
  }
})

app.post("/update_courses", checkAuthenticated, (req, res) => {
  /*const date = Date.now();
  fs.copyFile('public/courses.md', 'public/course-'+date+'.md', (err) => {
    if (err) throw err;
    console.log(date + ': Backed up the current course list')
  })
  fs.writeFile('public/courses.md', req.body.courses, (err) => {
    if (err) throw err;
    console.log(date + ': Updated the course list')
  })*/
  connection.query("UPDATE pmclub.courses set body = ? WHERE id = " + req.body.subjectId, [req.body.courses], (err, rows, fields) => {
    if (err) throw err;
  })
  res.redirect("/dashboard?res=courseupd#course-list")
})

app.post("/update_const", checkAuthenticated, (req, res) => {
  const date = Date.now();
  fs.copyFile('public/pmc.const.md', 'public/pmc-'+date+'.const.md', (err) => {
    if (err) throw err;
    console.log(date + ': Backed up the current constitution')
  })
  fs.writeFile('public/pmc.const.md', req.body.constitution, (err) => {
    if (err) throw err;
    console.log(date + ': Updated the constitution')
  })
  res.redirect("/dashboard?res=constupd#update-const")
})

app.post("/query_events", checkAuthenticated, (req, res) => {
  const { term, year } = req.body;
  const start = (term === 'winter' ? 1 : (term === 'spring' ? 5 : 9));
  //console.log(term);
  //console.log(year);
  connection.query("SELECT * FROM pmclub.events WHERE YEAR(date) = " + year + " AND MONTH(date) >= " + start + " AND MONTH(date) <= " + (start+3), (err, rows, fields) => {
    if (err) throw err;
    //console.log(rows);
    res.json(rows);
  })
})

app.post("/toggle_potw", checkAuthenticated, (req, res) => {
  isPOTW = !isPOTW;
  fs.writeFileSync('potw.json', JSON.stringify({potw: isPOTW}))
  res.redirect("/dashboard?res=potw" + (isPOTW ? "en" : "dis") + "abled#create-potw")
})

app.get("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(Date.now() + ': Admin logged out')
})
/*//Define the Logout
app.post("/logout", (req,res) => {
    req.logOut()
    res.redirect("/login")
    console.log(': Admin logged out')
})*/

/* /OAUTH WORK */

app.use(express.static('public'));

console.log('Static directory '+path.join(__dirname, '/public'));

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, '/views'))

app.get('/', (req, res) => {
  connection.query('SELECT * FROM pmclub.events ORDER BY date DESC LIMIT 3', (err, rows, fields) => {
    //console.log(connection)
    if (err) throw err;
    connection.query('SELECT * FROM pmclub.types', (err2, rows2, fields2) => {
      if (err2) throw err2;
      if (isPOTW) {
        connection.query('SELECT * FROM pmclub.potw ORDER BY date DESC', (err3, rows3, fields3) => {
          if (err3) throw err3;
          res.render('index', { posts: rows, types: rows2, potws: rows3, isPOTW: isPOTW });
        })
      } else {
        res.render('index', { posts: rows, types: rows2, isPOTW: isPOTW });
      }
    });
  })
});
app.get('/about', (req, res) => {
  res.render('about', { isPOTW: isPOTW });
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
  connection.query('SELECT * FROM pmclub.events ORDER BY date DESC LIMIT 1', (err, rows, fields) => {
    if (err) throw err;
    if (rows.length == 0) { return handleError(err, res); }
    res.redirect('/events/' + getTerm(rows[0].date.yyyymmdd()));
  });
  //res.render('events')
});
app.get('/const', (req, res) => {
  fs.readFile("public/pmc.const.md", "utf-8", (err, buf) => {
    var converter = new showdown.Converter();
    res.render('const', { isPOTW: isPOTW, constitution: converter.makeHtml(buf) });
  });
});
app.get('/courses', (req, res) => {
  /*
  fs.readFile("public/courses.md", "utf-8", (err, buf) => {
    var converter = new showdown.Converter();
    res.render('courses', { isPOTW: isPOTW, courses: converter.makeHtml(buf) });
  });
  */
  connection.query("SELECT * FROM pmclub.courses ORDER BY id", (err, rows, fields) => {
    var converter = new showdown.Converter();
    for (let i = 0; i < rows.length; ++i) {
      rows[i].body = converter.makeHtml(rows[i].body);
    }
    res.render('courses', { isPOTW: isPOTW, courses: rows });
  });
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
    res.render('error', { error: '404', isPOTW: isPOTW });
    return;
  }
  connection.query("SELECT * FROM pmclub.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date DESC", (err, rows, fields) => {
    if (err) throw err;
    connection.query("SELECT * FROM pmclub.types", (err2, rows2, fields2) => {
      //console.log(req.params.term)
      //console.log("SELECT * FROM pmclub.events WHERE date >= '"+getIneq(req.params.term)+"' ORDER BY date")
      for (var i = 0; i < rows.length; ++i) {
        //console.log(rows)
        var converter = new showdown.Converter();
        rows[i].body = converter.makeHtml(rows[i].body);
      }
      res.render('event', { posts: rows, types: rows2, reqTerm: req.params.term, isPOTW: isPOTW })
    })
  });
});

app.get('/potw', (req, res) => {
  if (!isPOTW) {
    res.status(404);
    res.render('error', { error: '404', isPOTW: isPOTW });
    return;
  }
  connection.query("SELECT * FROM pmclub.potw ORDER BY date DESC", (err, rows, fields) => {
    if (err) throw err;
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

app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})
