import axios from "axios";
const getUserToken = async (userId) => {
    if (!userId || typeof userId !== 'string') {
        throw new Error("Invalid userId provided");
    }
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("Token not found");
    return doc.data().accessToken;
};

const commitFile = async (req, res) => {
  const { userId, owner, repo, path, content, message } = req.body;
  try {
    const token = await getUserToken(userId);

    // Get current file SHA if exists
    let sha = undefined;
    try {
      const file = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      sha = file.data.sha;
    } catch (err) {
      // File doesn't exist, that's okay for create
    }

    const response = await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      message,
      content: Buffer.from(content).toString('base64'),
      sha
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.status(200).json({ success: true, commit: response.data.commit });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
};
export default commitFile;