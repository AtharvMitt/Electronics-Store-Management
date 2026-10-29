import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
}

export async function databaseReady() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().command({ ping: 1 }, { timeoutMS: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
