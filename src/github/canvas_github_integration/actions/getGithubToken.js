import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";

// Get GitHub access token from Firestore
const getGithubToken = async (req, res) => {
  const { userId, uid } = req.body;

  if (!userId && !uid) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: userId or uid",
      status: 400,
    });
  }

  try {
    let doc = null;
    let token = null;

    // Try to get token with userId first
    if (userId) {
      const githubIdStr = String(userId).trim();
      console.log("Fetching GitHub token for userId:", githubIdStr);
      
      doc = await db.collection("user_tokens").doc(githubIdStr).get();
      
      if (!doc.exists && !isNaN(githubIdStr)) {
        // Try as number
        const numId = parseInt(githubIdStr, 10);
        doc = await db.collection("user_tokens").doc(String(numId)).get();
      }
      
      if (doc && doc.exists) {
        const tokenData = doc.data();
        if (tokenData && tokenData.accessToken) {
          token = tokenData.accessToken;
          console.log("GitHub token found for userId:", githubIdStr);
        }
      }
    }

    // If userId didn't work, try via user_githubs using uid
    if (!token && uid) {
      console.log(`Token not found with userId, trying via user_githubs with uid: ${uid}...`);
      
      const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
      
      if (userGithubsDoc.exists) {
        const userData = userGithubsDoc.data();
        
        if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
          // Try each githubId in the array
          for (const githubIdFromArray of userData.github_ids) {
            const githubIdToTry = String(githubIdFromArray).trim();
            console.log(`Trying githubId from user_githubs: ${githubIdToTry}`);
            
            doc = await db.collection("user_tokens").doc(githubIdToTry).get();
            if (doc.exists) {
              const tokenData = doc.data();
              if (tokenData && tokenData.accessToken) {
                token = tokenData.accessToken;
                console.log(`Found token with githubId from user_githubs: ${githubIdToTry}`);
                break;
              }
            }
          }
        }
      }
    }

    // Last resort: Check all tokens with GitHub API to find the one that belongs to userId
    if (!token && userId) {
      const requestedIdStr = String(userId).trim();
      console.log(`Token not found in Firestore, verifying all tokens with GitHub API for userId: ${requestedIdStr}...`);
      
      const allTokens = await db.collection("user_tokens").get();
      console.log(`Found ${allTokens.docs.length} tokens to verify`);
      
      for (const tokenDoc of allTokens.docs) {
        const tokenData = tokenDoc.data();
        if (!tokenData || !tokenData.accessToken) continue;
        
        try {
          const testOctokit = new Octokit({ auth: tokenData.accessToken });
          const { data: user } = await testOctokit.rest.users.getAuthenticated();
          const tokenUserId = user.id.toString();
          
          if (tokenUserId === requestedIdStr) {
            console.log(`✅ Found matching token! Token document ID: ${tokenDoc.id} belongs to requested userId: ${requestedIdStr}`);
            token = tokenData.accessToken;
            break;
          }
        } catch (error) {
          // Skip invalid tokens
          continue;
        }
      }
    }

    if (token) {
      return res.status(200).json({
        success: true,
        token: token,
        status: 200,
      });
    } else {
      return res.status(404).json({
        success: false,
        error: "GitHub token not found",
        status: 404,
      });
    }
  } catch (error) {
    console.error("getGithubToken Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get GitHub token",
      status: 500,
    });
  }
};

export default getGithubToken;

