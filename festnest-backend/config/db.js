// config/db.js – MongoDB Atlas connection via Mongoose
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`  ✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`  ❌  MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed.');
  process.exit(0);
});

export default connectDB;
