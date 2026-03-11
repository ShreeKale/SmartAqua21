// const express = require("express");
// const app = express();

// const path = require("path");
// const ejsMate = require("ejs-mate");

// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));
// app.engine("ejs", ejsMate);

// app.use(express.static(path.join(__dirname, "public")));

// // Home route (root URL)
// app.get("/", (req, res) => {
//     res.render("pages/home.ejs");
// });

// // Other pages
// app.get("/home", (req, res) => {
//     res.render("pages/home.ejs");
// });

// app.get("/products", (req, res) => {
//     res.render("pages/products.ejs");
// });

// // Export for Vercel (no app.listen)
// //module.exports = app;
// app.listen(8080, () => {
//     console.log("app is listning to port 8080")
// })



const express = require("express");
const app = express();

const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");

// ---------------- MONGODB CONNECTION ----------------
mongoose.connect("mongodb://127.0.0.1:27017/smartaqua")
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch(err => console.log("DB Error:", err));

// ---------------- SCHEMA ----------------
const formSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const Form = mongoose.model("Form", formSchema);


// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.static(path.join(__dirname, "public")));

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
    res.render("pages/home.ejs");
});

app.get("/home", (req, res) => {
    res.render("pages/home.ejs");
});

app.get("/products", (req, res) => {
    res.render("pages/products.ejs");
});

app.get("/admin/submissions", async (req, res) => {
    const submissions = await Form.find().sort({ date: -1 });
    res.render("pages/admin.ejs", { submissions });
});


// ----------- SAVE FORM DATA ROUTE (IMPORTANT) -----------
app.post("/submit-form", async (req, res) => {
    try {
        const newForm = new Form(req.body);
        await newForm.save();

        res.json({ success: true, message: "Form submitted successfully!" });
    } catch (err) {
        res.json({ success: false, error: err });
    }
});

// ---------------- SERVER LISTEN ----------------
app.listen(8080, () => {
    console.log("App is listening on port 8080");
});
