import { db } from "../../../../config/firebase.js";
import { Octokit } from "octokit";

// Get GitHub access token from Firestore
const getGitHubToken = async (userId) => {
  const doc = await db.collection("user_tokens").doc(userId).get();
  if (!doc.exists) throw new Error("GitHub token not found");
  return doc.data().accessToken;
};

// Build a nested folder tree structure from file paths
const buildFolderTree = (filePaths) => {
  const tree = {};
  filePaths.forEach(({ path }) => {
    const parts = path.split("/");
    let current = tree;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current[part] = null; // file
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    });
  });
  return tree;
};

// Render tree structure to formatted string
const renderTree = (tree, indent = "") => {
  let output = "";
  for (const key in tree) {
    output += `${indent}/${key}\n`;
    if (tree[key]) {
      output += renderTree(tree[key], indent + "  ");
    }
  }
  return output;
};

// Main API Handler
const getRepositoryContent = async (req, res) => {
  const { userId, repoFullName, branch } = req.body;

  if (!userId || !repoFullName || !branch) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: userId, repoFullName, branch",
      status: 400,
    });
  }

  try {
    const token = await getGitHubToken(userId);
    const octokit = new Octokit({ auth: token });

    const [owner, repo] = repoFullName.split("/");

    // Check current rate limit
    const { data: rateData } = await octokit.rest.rateLimit.get();
    if (rateData.rate.remaining === 0) {
      return res.status(403).json({
        success: false,
        error: "GitHub API rate limit exceeded. Please wait and try again later.",
        resetAt: new Date(rateData.rate.reset * 1000).toISOString(),
        status: 403,
      });
    }

    // Get repo metadata
    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });

    // Get branch reference
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    // Get full file tree
    const { data: treeData } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: refData.object.sha,
      recursive: true,
    });

    // Extract only file entries
    const files = treeData.tree
      .filter((item) => item.type === "blob")
      .map((file) => ({
        path: file.path,
        size: file.size,
        sha: file.sha,
        type: "file",
      }));

    // Build tree view
    const folderTree = buildFolderTree(files);
    const folderStructure = renderTree(folderTree);

    return res.status(200).json({
      success: true,
      repoInfo: {
        name: repoInfo.name,
        full_name: repoInfo.full_name,
        description: repoInfo.description,
        html_url: repoInfo.html_url,
        language: repoInfo.language,
      },
      branch,
      fileCount: files.length,
      folderStructure,
      files, // metadata only, no base64 content
      rateRemaining: rateData.rate.remaining,
      status: 200,
    });
  } catch (error) {
    console.error("GitHub Content Error:", error);

    const status = error.status || 500;
    const message =
      error.response?.data?.message || error.message || "Failed to fetch repository content";

    return res.status(status).json({
      success: false,
      error: message,
      details: error.response?.data,
      status,
    });
  }
};

export default getRepositoryContent;
