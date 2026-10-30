import mongoose from 'mongoose';

const uri = process.env.TEST_MONGODB_URI;
if (!uri) throw new Error('TEST_MONGODB_URI is required.');
const connection = mongoose.createConnection();
try {
  await connection.openUri(uri, { serverSelectionTimeoutMS: 30000 });
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName || !hello.isWritablePrimary) throw new Error('MongoDB must be a writable replica set.');
  console.log('MongoDB replica set is ready for integration tests.');
} finally {
  await connection.close();
}
