import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";

// Fetch token from Firestore
const getGitHubToken = async (userId) => {
  const doc = await db.collection("user_tokens").doc(userId).get();
  if (!doc.exists) throw new Error("GitHub token not found");
  return doc.data().accessToken;
};

// Main Handler
const getFileContent = async (req, res) => {
  const { userId, repoFullName, branch, path } = req.body;

  if (!userId || !repoFullName || !branch || !path) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: userId, repoFullName, branch, path",
      status: 400,
    });
  }

  try {
    const token = await getGitHubToken(userId);
    const octokit = new Octokit({ auth: token });

    const [owner, repo] = repoFullName.split("/");

    const { data: contentData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    const decoded = Buffer.from(contentData.content, "base64").toString("utf-8");

    return res.status(200).json({
      success: true,
      content: decoded,
    });
  } catch (error) {
    console.error("File Fetch Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message || error.message || "Failed to fetch file content";

    return res.status(status).json({
      success: false,
      error: message,
      status,
    });
  }
};

export default getFileContent;
