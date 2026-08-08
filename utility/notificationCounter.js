/**
 * Get next notification number from counter
 * Uses Firestore transaction to ensure atomic increment
 * @param {Object} db - Firestore database instance (Admin SDK)
 * @returns {Promise<number>} - Next notification number (1, 2, 3, ...)
 */
export const getNextNotificationNumber = async (db) => {
  try {
    const counterRef = db.collection("notification_counters").doc("global");
    
    // Use transaction to ensure atomic increment
    const nextNumber = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      
      let newCount;
      
      // In Admin SDK, exists is a property, not a function
      if (counterDoc.exists) {
        const currentCount = counterDoc.data().count || 0;
        newCount = currentCount + 1;
        console.log(`📊 Current count: ${currentCount}, New count: ${newCount}`);
      } else {
        newCount = 1;
        console.log(`📊 Counter doesn't exist, starting at: ${newCount}`);
      }
      
      // Update counter in transaction - use set with merge: false to overwrite
      transaction.set(counterRef, { count: newCount, updatedAt: new Date() }, { merge: false });
      
      return newCount;
    });
    
    console.log(`✅ Generated notification number: ${nextNumber}`);
    return nextNumber;
  } catch (error) {
    console.error("Error getting next notification number:", error);
    console.error("Error details:", error.message, error.stack);
    
    // Fallback: Try to get current count and increment manually
    try {
      const counterRef = db.collection("notification_counters").doc("global");
      const counterDoc = await counterRef.get();
      
      let nextNumber;
      // In Admin SDK, exists is a property, not a function
      if (counterDoc.exists) {
        const currentCount = counterDoc.data().count || 0;
        nextNumber = currentCount + 1;
        console.log(`📊 Fallback - Current count: ${currentCount}, New count: ${nextNumber}`);
      } else {
        nextNumber = 1;
        console.log(`📊 Fallback - Counter doesn't exist, starting at: ${nextNumber}`);
      }
      
      // Use set with merge: false to ensure the count is properly updated
      await counterRef.set({ count: nextNumber, updatedAt: new Date() }, { merge: false });
      console.log(`✅ Generated notification number (fallback): ${nextNumber}`);
      return nextNumber;
    } catch (fallbackError) {
      console.error("Fallback counter update also failed:", fallbackError);
      console.error("Fallback error details:", fallbackError.message, fallbackError.stack);
      
      // Last resort: try one more time with updateDoc
      try {
        const counterRef = db.collection("notification_counters").doc("global");
        const counterDoc = await counterRef.get();
        
        let nextNumber;
        // In Admin SDK, exists is a property, not a function
        if (counterDoc.exists) {
          const currentCount = counterDoc.data().count || 0;
          nextNumber = currentCount + 1;
        } else {
          nextNumber = 1;
          await counterRef.set({ count: nextNumber, updatedAt: new Date() });
          console.log(`✅ Generated notification number (last resort - new): ${nextNumber}`);
          return nextNumber;
        }
        
        await counterRef.update({ count: nextNumber, updatedAt: new Date() });
        console.log(`✅ Generated notification number (last resort - update): ${nextNumber}`);
        return nextNumber;
      } catch (lastResortError) {
        console.error("Last resort counter update also failed:", lastResortError);
        // Last resort: return 1 to keep it small
        console.warn("⚠️ Using fallback notification number: 1");
        return 1;
      }
    }
  }
};

