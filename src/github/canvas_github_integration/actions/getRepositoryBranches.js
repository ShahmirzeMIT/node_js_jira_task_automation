import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";

// Get GitHub access token from Firestore
const getGitHubToken = async (userId) => {
  const doc = await db.collection("user_tokens").doc(userId).get();
  if (!doc.exists) throw new Error("GitHub token not found");
  return doc.data().accessToken;
};

// Get all branches of a GitHub repository
const getRepositoryBranches = async (req, res) => {
  const { userId, repoFullName } = req.body;

  if (!userId || !repoFullName) {
    return res.status(400).json({
      success: false,
      error: "userId and repoFullName are required",
      status: 400,
    });
  }

  try {
    const token = await getGitHubToken(userId);
    const octokit = new Octokit({ auth: token });

    const [owner, repo] = repoFullName.split("/");

    const { data: branches } = await octokit.rest.repos.listBranches({
      owner,
      repo,
    });

    const branchList = branches.map((branch) => ({
      name: branch.name,
      protected: branch.protected,
      commitSha: branch.commit.sha,
    }));

    res.status(200).json({
      success: true,
      repoFullName,
      totalBranches: branchList.length,
      branches: branchList,
      status: 200,
    });
  } catch (error) {
    console.error("GitHub Branches Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message || "Failed to fetch repository branches";

    res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default getRepositoryBranches;
