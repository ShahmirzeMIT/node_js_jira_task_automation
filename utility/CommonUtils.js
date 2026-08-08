import { db } from '../config/firebase.js';

// Generate a random ID
export const MakeId = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Compress a string to base64
export const CompressString = (str) => {
  return zlib.gzipSync(str).toString('base64');
};

// Decompress a base64 string
export const DecompressString = (base64Str) => {
  const buffer = Buffer.from(base64Str, 'base64');
  return zlib.gunzipSync(buffer).toString();
};

// Get current date in YYYY-MM-DD
export const GetCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get current time in HH:MM:SS
export const GetCurrentTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

// Get current date and time in full format
export const GetCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Auto-increment counter in Firestore
export const GetCounter = async (collectionName) => {
  try {
    const docRef = db.collection('counters').doc(collectionName);
    const counterDoc = await docRef.get();

    let currentCount = 0;
    if (counterDoc.exists) {
      currentCount = counterDoc.data().count || 0;
    }

    const nextCount = currentCount + 1;
    await docRef.set({ count: nextCount });

    return nextCount;
  } catch (err) {
    console.error('Auto-Increment Error:', err);
    return null;
  }
};

function parseGeminiResponse(rawResponse) {
    try {
        // 1️⃣ Önce model yanıtındaki text kısmını alıyoruz
        const obj = JSON.parse(rawResponse);
        const textWithJson = obj?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textWithJson) throw new Error("No text found in response");

        // 2️⃣ Kod bloklarını ve gereksiz karakterleri temizle
        const cleanText = textWithJson.replace(/```json|```/g, "").trim();

        // 3️⃣ JSON stringini parse et
        const parsedJson = JSON.parse(cleanText);

        return parsedJson;
    } catch (error) {
        console.error("Failed to parse Gemini response:", error);
        return rawResponse;
    }
}

export default {
  GetCounter,
  MakeId,
  CompressString,
  DecompressString,
  GetCurrentDate,
  GetCurrentDateTime,
    GetCurrentTime,
    parseGeminiResponse
}
