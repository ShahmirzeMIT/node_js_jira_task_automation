import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";
import { Buffer } from "buffer";

const getGitHubToken = async (userId) => {
  const doc = await db.collection("user_tokens").doc(userId).get();
  if (!doc.exists) throw new Error("GitHub token not found");
  return doc.data().accessToken;
};

const updateGitHubFileContent = async (req, res) => {
  const { userId, repoFullName, branch, path, newContent, commitMessage } = req.body;

  if (!userId || !repoFullName || !branch || !path || !newContent) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: userId, repoFullName, branch, path, newContent",
      status: 400,
    });
  }

  try {
    const token = await getGitHubToken(userId);
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = repoFullName.split("/");

    // Step 1: Get the existing file to retrieve SHA
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    const currentSha = fileData.sha;

    // Step 2: Encode new content as base64
    const contentBase64 = Buffer.from(newContent).toString("base64");

    // Step 3: Update the file via PUT
    const updateRes = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      branch,
      message: commitMessage || `Update ${path} via API`,
      content: contentBase64,
      sha: currentSha,
    });

    return res.status(200).json({
      success: true,
      message: "File updated successfully",
      contentPath: path,
      commit: updateRes.data.commit,
      status: 200,
    });
  } catch (error) {
    console.error("GitHub File Update Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message || "Failed to update file on GitHub";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default updateGitHubFileContent;
