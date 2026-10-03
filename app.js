
const { webcrypto } = require("crypto");

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

require("dotenv").config();

const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");
const session = require("express-session");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === "production";

// =====================================================
// CONFIGURATION
// =====================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

if (isProduction) {
    app.set("trust proxy", 1);
}

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

// =====================================================
// DATABASE
// =====================================================

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("=================================");
        console.log("Database connected");
        console.log("Database:", mongoose.connection.name);
        console.log("Host:", mongoose.connection.host);
        console.log("=================================");
    })
    .catch((error) => {
        console.error("Database connection error:", error.message);
    });

// =====================================================
// MONGOOSE SCHEMA
// =====================================================

const formSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 25
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254
    },
    address: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    customRequirement: {
        type: String,
        default: "",
        trim: true,
        maxlength: 3000
    },
    selections: {
        roPlants: { type: [String], default: [] },
        dmPlants: { type: [String], default: [] },
        chillers: { type: [String], default: [] },
        softeners: { type: [String], default: [] }
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const Form = mongoose.model("Form", formSchema);

// =====================================================
// EMAIL CONFIGURATION
// =====================================================

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const BUSINESS_NAME = "Smart Aqua";
const BUSINESS_PHONE = "+91 94235 14131";

// Sender email
const BUSINESS_EMAIL = process.env.EMAIL_USER;

// Admin notification email
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || BUSINESS_EMAIL;

// Escape user-provided values before inserting into HTML.
function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[char];
    });
}

function getSelectedProducts(selections) {
    return [
        ...selections.roPlants,
        ...selections.dmPlants,
        ...selections.chillers,
        ...selections.softeners
    ];
}

function createProductsHtml(products) {
    if (products.length === 0) {
        return "<li>No specific product selected</li>";
    }

    return products
        .map((product) => `<li>${escapeHtml(product)}</li>`)
        .join("");
}

// =====================================================
// ADMIN AUTHENTICATION
// =====================================================

function isAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        return next();
    }

    return res.redirect("/admin/login");
}

// =====================================================
// PUBLIC ROUTES
// =====================================================

app.get("/", (req, res) => {
    res.render("pages/home");
});

app.get("/home", (req, res) => {
    res.render("pages/home");
});

app.get("/products", (req, res) => {
    res.render("pages/products");
});

// =====================================================
// ADMIN LOGIN / LOGOUT
// =====================================================

app.get("/admin/login", (req, res) => {
    res.render("pages/login");
});

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
    ) {
        req.session.admin = true;
        return res.redirect("/admin/submissions");
    }

    return res.status(401).send("Invalid credentials");
});

app.post("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// Keep the previous logout URL working.
app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// =====================================================
// ADMIN SUBMISSIONS
// =====================================================

app.get("/admin/submissions", isAdmin, async (req, res) => {
    try {
        const submissions = await Form.find().sort({ date: -1 });

        res.render("pages/admin", { submissions });
    } catch (error) {
        console.error("Error loading submissions:", error);
        res.status(500).send("Unable to load submissions");
    }
});

// =====================================================
// FORM VALIDATION
// =====================================================

function validateInquiry(body) {
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const address = String(body.address || "").trim();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[+()\d\s.-]{7,25}$/;

    if (!name || !phone || !email || !address) {
        return "Please complete all required fields.";
    }

    if (name.length > 100) {
        return "Name must be 100 characters or fewer.";
    }

    if (!phonePattern.test(phone)) {
        return "Please enter a valid contact number.";
    }

    if (email.length > 254 || !emailPattern.test(email)) {
        return "Please enter a valid email address.";
    }

    if (address.length > 500) {
        return "Address must be 500 characters or fewer.";
    }

    if (String(body.customRequirement || "").length > 3000) {
        return "Custom requirements are too long.";
    }

    return null;
}

// =====================================================
// SUBMIT INQUIRY + SEND EMAILS
// =====================================================

app.post("/submit-form", async (req, res) => {
    try {
        const validationError = validateInquiry(req.body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const formData = {
            name: String(req.body.name).trim(),
            phone: String(req.body.phone).trim(),
            email: String(req.body.email).trim().toLowerCase(),
            address: String(req.body.address).trim(),
            customRequirement: String(
                req.body.customRequirement || ""
            ).trim(),
            selections: {
                roPlants: req.body.roPlant
                    ? [String(req.body.roPlant)]
                    : [],
                dmPlants: req.body.dmPlant
                    ? [String(req.body.dmPlant)]
                    : [],
                chillers: req.body.waterChiller
                    ? [String(req.body.waterChiller)]
                    : [],
                softeners: req.body.waterSoftener
                    ? [String(req.body.waterSoftener)]
                    : []
            }
        };

        // Save inquiry first, so email failure won't lose it.
        const savedData = await Form.create(formData);

        console.log("Inquiry saved:", savedData._id);

        const products = getSelectedProducts(formData.selections);
        const productsHtml = createProductsHtml(products);

        const productsText = products.length
            ? products.map((item) => `- ${item}`).join("\n")
            : "No specific product selected";

        const safeName = escapeHtml(formData.name);
        const safePhone = escapeHtml(formData.phone);
        const safeEmail = escapeHtml(formData.email);
        const safeAddress = escapeHtml(formData.address);

        const safeRequirement = escapeHtml(
            formData.customRequirement ||
            "No additional requirements provided"
        );

        // =================================================
        // CUSTOMER CONFIRMATION EMAIL
        // =================================================

        const customerEmail = {
            from: `"${BUSINESS_NAME}" <${BUSINESS_EMAIL}>`,
            to: formData.email,
            subject: "We received your Smart Aqua inquiry",

            text: `Dear ${formData.name},

Thank you for contacting Smart Aqua. We have received your inquiry.

Selected products:
${productsText}

Your requirements:
${formData.customRequirement || "No additional requirements provided"}

Our team will review your inquiry and contact you soon.

${BUSINESS_NAME}
Phone: ${BUSINESS_PHONE}
Email: ${BUSINESS_EMAIL}`,

            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1e293b;line-height:1.6">
                    <div style="background:#2563eb;color:#fff;padding:22px;border-radius:12px 12px 0 0">
                        <h2 style="margin:0">Smart Aqua</h2>
                        <p style="margin:5px 0 0">Industrial Water Treatment Solutions</p>
                    </div>

                    <div style="padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
                        <h3>Thank you, ${safeName}!</h3>

                        <p>
                            We have received your inquiry.
                            Our team will review your requirements
                            and contact you soon.
                        </p>

                        <h4>Selected products</h4>
                        <ul>${productsHtml}</ul>

                        <h4>Your requirements</h4>
                        <p style="white-space:pre-wrap">${safeRequirement}</p>

                        <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0">

                        <p>
                            <strong>Smart Aqua</strong><br>
                            Phone: ${escapeHtml(BUSINESS_PHONE)}<br>
                            Email: ${escapeHtml(BUSINESS_EMAIL)}
                        </p>
                    </div>
                </div>
            `
        };

        // =================================================
        // ADMIN NOTIFICATION EMAIL
        // =================================================

        const adminEmail = {
            from: `"Smart Aqua Website" <${BUSINESS_EMAIL}>`,
            to: ADMIN_EMAIL,
            replyTo: formData.email,
            subject: `New website inquiry from ${formData.name}`,

            text: `A new inquiry was submitted.

Name: ${formData.name}
Phone: ${formData.phone}
Email: ${formData.email}
Address: ${formData.address}

Selected products:
${productsText}

Custom requirements:
${formData.customRequirement || "None"}

Inquiry ID: ${savedData._id}
Date: ${savedData.date.toISOString()}`,

            html: `
                <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#1e293b;line-height:1.6">
                    <h2 style="background:#1e293b;color:#fff;padding:18px;border-radius:10px">
                        New Smart Aqua Inquiry
                    </h2>

                    <p><strong>Name:</strong> ${safeName}</p>
                    <p><strong>Phone:</strong> ${safePhone}</p>
                    <p><strong>Email:</strong> ${safeEmail}</p>
                    <p><strong>Installation address:</strong> ${safeAddress}</p>

                    <h3>Selected products</h3>
                    <ul>${productsHtml}</ul>

                    <h3>Custom requirements</h3>
                    <p style="white-space:pre-wrap">${safeRequirement}</p>

                    <hr>

                    <p><strong>Inquiry ID:</strong> ${escapeHtml(savedData._id)}</p>
                    <p><strong>Date:</strong> ${escapeHtml(savedData.date.toISOString())}</p>
                </div>
            `
        };

        // =================================================
        // SEND BOTH EMAILS INDEPENDENTLY
        // =================================================

        const emailResults = await Promise.allSettled([
            transporter.sendMail(customerEmail),
            transporter.sendMail(adminEmail)
        ]);

        const customerEmailSent =
            emailResults[0].status === "fulfilled";

        const adminEmailSent =
            emailResults[1].status === "fulfilled";

        if (!customerEmailSent) {
            console.error(
                "Customer email failed:",
                emailResults[0].reason?.message
            );
        }

        if (!adminEmailSent) {
            console.error(
                "Admin notification failed:",
                emailResults[1].reason?.message
            );
        }

        const emailSent =
            customerEmailSent && adminEmailSent;

        return res.status(201).json({
            success: true,
            message: emailSent
                ? "Inquiry saved and emails sent successfully."
                : "Your inquiry was saved, but one or more emails could not be sent.",
            id: savedData._id,
            emailSent,
            customerEmailSent,
            adminEmailSent
        });

    } catch (error) {
        console.error("Inquiry submission error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to submit your inquiry. Please try again."
        });
    }
});

// =====================================================
// DATABASE TEST
// =====================================================

app.get("/test-db", isAdmin, async (req, res) => {
    try {
        const count = await Form.countDocuments();

        res.json({
            connected: mongoose.connection.readyState === 1,
            database: mongoose.connection.name,
            host: mongoose.connection.host,
            count
        });

    } catch (error) {
        console.error("Database test error:", error);

        res.status(500).json({
            connected: false,
            message: "Database test failed."
        });
    }
});

// =====================================================
// DELETE SUBMISSION
// =====================================================

app.post("/delete/:id", isAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).send("Invalid submission ID");
        }

        await Form.findByIdAndDelete(req.params.id);

        return res.redirect("/admin/submissions");

    } catch (error) {
        console.error("Delete error:", error);

        return res.status(500).send(
            "Unable to delete submission"
        );
    }
});

// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================

if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from .env");
}

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    console.warn("Admin credentials are missing.");
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
        "Email credentials are missing. Email sending will fail."
    );
}

// =====================================================
// SERVER
// =====================================================

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Smart Aqua server running on port ${PORT}`);
    });
}

module.exports = app;