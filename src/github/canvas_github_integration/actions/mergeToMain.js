import { Octokit } from "octokit";

// Get GitHub access token from Firestore
const getGitHubToken = async (userId, uid = null) => {
  if (!userId && !uid) {
    throw new Error("userId or uid is required");
  }
  
  const { db } = await import("../../../config/firebase.js");
  let doc = null;
  
  // Try to get token with userId first
  if (userId) {
    const githubIdStr = String(userId).trim();
    doc = await db.collection("user_tokens").doc(githubIdStr).get();
    
    if (doc && doc.exists) {
      const tokenData = doc.data();
      if (tokenData && tokenData.accessToken) {
        return tokenData.accessToken;
      }
    }
  }
  
  // If userId didn't work, try to find token via user_githubs using uid
  if (uid) {
    const userGithubsDoc = await db.collection("user_githubs").doc(uid).get();
    
    if (userGithubsDoc.exists) {
      const userData = userGithubsDoc.data();
      if (userData.github_ids && Array.isArray(userData.github_ids) && userData.github_ids.length > 0) {
        for (const githubIdFromArray of userData.github_ids) {
          const githubIdToTry = String(githubIdFromArray).trim();
          doc = await db.collection("user_tokens").doc(githubIdToTry).get();
          if (doc.exists) {
            const tokenData = doc.data();
            if (tokenData && tokenData.accessToken) {
              return tokenData.accessToken;
            }
          }
        }
      }
    }
  }
  
  throw new Error(`GitHub token not found for userId: ${userId || 'N/A'}. Please authenticate with GitHub first.`);
};

// Main handler
const mergeToMain = async (req, res) => {
  const { userId, uid, repoFullName, projectId, githubToken, head, base, commitMessage } = req.body;

  if (!repoFullName) {
    return res.status(400).json({
      success: false,
      error: "Missing required field: repoFullName",
      status: 400,
    });
  }

  try {
    // Get GitHub token
    let token;
    if (githubToken) {
      console.log("✅ Using GitHub token provided from frontend");
      token = githubToken;
    } else {
      console.log("⚠️ Token not provided from frontend, attempting to get from Firestore");
      try {
        token = await getGitHubToken(userId, uid);
      } catch (tokenError) {
        console.error("❌ Failed to get token from Firestore:", tokenError.message);
        return res.status(401).json({
          success: false,
          error: "GitHub token not found. Please authenticate with GitHub first.",
          status: 401,
        });
      }
    }
    
    const octokit = new Octokit({ auth: token });

    // Parse repoFullName to get owner and repo
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        error: "Invalid repoFullName format. Expected: owner/repo",
        status: 400,
      });
    }

    // Get default branch (usually 'main' or 'master')
    let defaultBranch = base || "main";
    try {
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
      defaultBranch = repoData.default_branch;
    } catch (error) {
      console.warn("Could not get default branch, using 'main'");
    }

    // Get all branches
    const { data: branches } = await octokit.rest.repos.listBranches({
      owner,
      repo,
    });

    // Find the head branch (branch to merge from)
    let headBranch = head;
    if (!headBranch) {
      // Find a branch that's not the default branch
      const nonDefaultBranch = branches.find(b => b.name !== defaultBranch);
      if (nonDefaultBranch) {
        headBranch = nonDefaultBranch.name;
      } else {
        return res.status(400).json({
          success: false,
          error: `No branch found to merge. Only default branch (${defaultBranch}) exists.`,
          status: 400,
        });
      }
    }

    // Check if head branch exists
    const headBranchExists = branches.some(b => b.name === headBranch);
    if (!headBranchExists) {
      return res.status(400).json({
        success: false,
        error: `Branch "${headBranch}" not found in repository.`,
        status: 400,
      });
    }

    // Get the SHA of the head branch
    const { data: headBranchData } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: headBranch,
    });

    // Get the SHA of the base branch
    const { data: baseBranchData } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch,
    });

    // Merge the head branch into the base branch
    const mergeMessage = commitMessage || `Merge ${headBranch} into ${defaultBranch}`;
    
    console.log(`Merging branch: ${headBranch} -> ${defaultBranch}`);
    console.log(`Head SHA: ${headBranchData.commit.sha}`);
    console.log(`Base SHA: ${baseBranchData.commit.sha}`);

    try {
      const { data: mergeResult } = await octokit.rest.repos.merge({
        owner,
        repo,
        base: defaultBranch,
        head: headBranch,
        commit_message: mergeMessage,
      });

      console.log(`Merge completed successfully!`);
      console.log(`  - SHA: ${mergeResult.sha}`);
      console.log(`  - Message: ${mergeResult.commit.message}`);

      return res.status(200).json({
        success: true,
        merge: {
          sha: mergeResult.sha,
          message: mergeResult.commit.message,
          merged: mergeResult.merged,
        },
        status: 200,
      });
    } catch (mergeError) {
      // Check if it's a merge conflict or already merged
      if (mergeError.status === 409) {
        const errorMessage = mergeError.response?.data?.message || mergeError.message;
        if (errorMessage.includes("already merged") || errorMessage.includes("Nothing to merge")) {
          return res.status(200).json({
            success: true,
            merge: {
              message: "Branch is already merged or up to date",
              merged: true,
            },
            status: 200,
          });
        }
        return res.status(409).json({
          success: false,
          error: "Merge conflict detected. Please resolve conflicts manually.",
          details: errorMessage,
          status: 409,
        });
      }
      throw mergeError;
    }
  } catch (error) {
    console.error("mergeToMain Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message ||
      error.message ||
      "Failed to merge to main";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default mergeToMain;

