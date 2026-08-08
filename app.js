require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");
const session = require("express-session");

// ================= DATABASE =================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Database Connected"))
    .catch(err => console.log(err));

// ================= SCHEMA (FINAL) =================
const formSchema = new mongoose.Schema({
    name: String,
    phone: String,
    address: String,
    customRequirement: { type: String, default: "" },

    selections: {
        roPlants: { type: [String], default: [] },
        dmPlants: { type: [String], default: [] },
        chillers: { type: [String], default: [] },
        softeners: { type: [String], default: [] }
    },

    date: { type: Date, default: Date.now }
});

const Form = mongoose.model("Form", formSchema);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

// ================= ROUTES =================
app.get("/", (req, res) => res.render("pages/home"));
app.get("/home", (req, res) => res.render("pages/home"));
app.get("/products", (req, res) => res.render("pages/products"));

// ================= AUTH =================
function isAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    return res.redirect("/admin/login");
}

// ================= LOGIN =================
app.get("/admin/login", (req, res) => {
    res.render("pages/login");
});

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        req.session.admin = true;
        return res.redirect("/admin/submissions");
    }

    res.send("Invalid Credentials");
});

app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// ================= ADMIN =================
app.get("/admin/submissions", isAdmin, async (req, res) => {
    const submissions = await Form.find().sort({ date: -1 });
    res.render("pages/admin", { submissions });
});

// ================= FORM SUBMIT =================
app.post("/submit-form", async (req, res) => {
    try {
        console.log("BODY RECEIVED:");
        console.log(JSON.stringify(req.body, null, 2));

        const roPlants = req.body.roPlant ? [req.body.roPlant] : [];
        const dmPlants = req.body.dmPlant ? [req.body.dmPlant] : [];
        const chillers = req.body.waterChiller ? [req.body.waterChiller] : [];
        const softeners = req.body.waterSoftener ? [req.body.waterSoftener] : [];
        const customRequirement = req.body.customRequirement || "";

        const formData = {
            name: req.body.name,
            phone: req.body.phone,
            address: req.body.address,
            customRequirement,

            selections: {
                roPlants,
                dmPlants,
                chillers,
                softeners
            }
        };

        console.log("SAVING:");
        console.log(JSON.stringify(formData, null, 2));

        await Form.create(formData);

        res.json({ success: true });

    } catch (err) {
        console.log(err);
        res.json({ success: false });
    }
});

// ================= DELETE =================
app.post("/delete/:id", isAdmin, async (req, res) => {
    await Form.findByIdAndDelete(req.params.id);
    res.redirect("/admin/submissions");
});

// ================= SERVER =================
const PORT = process.env.PORT || 8080;

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log("Server running on " + PORT);
    });
}

module.exports = app;