import axios from "axios";
import { db } from "../../../../config/firebase.js";
const getUserToken = async (userId) => {
    if (!userId || typeof userId !== 'string') {
        throw new Error("Invalid userId provided");
    }
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("Token not found");
    return doc.data().accessToken;
};

const pushChanges = async (req, res) => {
  const { userId, owner, repo, branch = "main", files, message } = req.body;
  try {
    const token = await getUserToken(userId);

    // 1. Get the latest commit SHA
    const ref = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const latestCommitSha = ref.data.object.sha;

    // 2. Get the commit tree SHA
    const commit = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const baseTreeSha = commit.data.tree.sha;

    // 3. Create blobs for each file
    const blobPromises = files.map(file =>
      axios.post(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        content: file.content,
        encoding: "utf-8"
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
    const blobs = await Promise.all(blobPromises);

    // 4. Create tree
    const treeItems = files.map((file, i) => ({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blobs[i].data.sha
    }));

    const newTree = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      base_tree: baseTreeSha,
      tree: treeItems
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 5. Create commit
    const newCommit = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: newTree.data.sha,
      parents: [latestCommitSha]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // 6. Update the reference (push)
    await axios.patch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      sha: newCommit.data.sha
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.status(200).json({ success: true, commit: newCommit.data });
  } catch (error) {
    console.error("Push error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
}
export default pushChanges;