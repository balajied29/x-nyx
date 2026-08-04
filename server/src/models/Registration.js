import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    source: { type: String, default: "teaser" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

// The dashboard always sorts newest-first and the chart buckets by day.
registrationSchema.index({ createdAt: -1 });

export const Registration =
  mongoose.models.Registration ?? mongoose.model("Registration", registrationSchema);
