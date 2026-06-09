const express = require("express");
const app = express();
const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");
const session = require("express-session");

// ================= DATABASE =================
mongoose.connect("mongodb://127.0.0.1:27017/smartaqua")
    .then(() => console.log("Database Connected"))
    .catch(err => console.log(err));

// ================= SCHEMA =================
const formSchema = new mongoose.Schema({
    name: String,
    phone: String,
    address: String,
    roPlant: String,
    chiller: String,
    date: { type: Date, default: Date.now }
});

const Form = mongoose.model("Form", formSchema);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "smartaqua_secret_key",
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

// ================= HOME ROUTES =================
app.get("/", (req, res) => res.render("pages/home"));
app.get("/home", (req, res) => res.render("pages/home"));
app.get("/products", (req, res) => res.render("pages/products"));

// ================= AUTH MIDDLEWARE (FIXED) =================
function isAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        return next();
    }
    return res.redirect("/admin/login");
}

// ================= LOGIN PAGE =================
app.get("/admin/login", (req, res) => {
    res.render("pages/login");
});

// ================= LOGIN POST =================
app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "admin" && password === "admin123") {
        req.session.admin = true;
        return res.redirect("/admin/submissions");
    }

    res.send("Invalid Credentials");
});

// ================= LOGOUT =================
app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// ================= ADMIN PAGE (PROTECTED) =================
app.get("/admin/submissions", isAdmin, async (req, res) => {
    const submissions = await Form.find().sort({ date: -1 });
    res.render("pages/admin", { submissions });
});

// ================= FORM SUBMIT =================
app.post("/submit-form", async (req, res) => {
    try {
        await Form.create(req.body);
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.json({ success: false });
    }
});

// ================= DELETE (PROTECTED) =================
app.post("/delete/:id", isAdmin, async (req, res) => {
    await Form.findByIdAndDelete(req.params.id);
    res.redirect("/admin/submissions");
});

// ================= SERVER (RENDER READY) =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});