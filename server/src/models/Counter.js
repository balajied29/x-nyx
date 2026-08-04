import mongoose from "mongoose";

/** One document per counter, e.g. { _id: "visitors", seq: 4821 }. */
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.models.Counter ?? mongoose.model("Counter", counterSchema);

/** Atomically claim the next number in a sequence. */
export async function nextInSequence(name) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return doc.seq;
}

export async function currentSequence(name) {
  const doc = await Counter.findById(name).lean();
  return doc?.seq ?? 0;
}
