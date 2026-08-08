import axios from "axios";
import { db } from "../../../../config/firebase.js";
const getUserToken = async (userId) => {
  const doc = await db.collection('user_tokens').doc(userId).get();
  if (!doc.exists) throw new Error("Token not found");
  return doc.data().accessToken;
};

const pullRepository = async (req, res) => {
  const { userId, owner, repo, branch = "main" } = req.query;
  try {
    const token = await getUserToken(userId);

    const commits = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.status(200).json({
      success: true,
      commits: commits.data
    });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
}

export default pullRepository;