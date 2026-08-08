import axios from 'axios';
import { db } from '../../../../config/firebase.js';

const getGitHubToken = async (userId) => {
  const doc = await db.collection("user_tokens").doc(userId).get();
  if (!doc.exists) throw new Error("GitHub token not found");
  return doc.data().accessToken;
};

export const addFileChanges = async (req, res) => {
  try {
    const { userId, repoFullName, path, newContent, branch } = req.body;
    const token = await getGitHubToken(userId);

    const getFileUrl = `https://api.github.com/repos/${repoFullName}/contents/${path}`;
    let fileSha = null;

    try {
      const fileRes = await axios.get(getFileUrl + `?ref=${branch}`, {
        headers: { Authorization: `token ${token}` }
      });
      fileSha = fileRes.data.sha;
    } catch (error) {
      if (error.response?.status !== 404) throw error;
    }

    const content = Buffer.from(newContent).toString('base64');
    const response = await axios.put(getFileUrl, {
      message: `Update ${path}`,
      content,
      sha: fileSha,
      branch
    }, {
      headers: { Authorization: `token ${token}` }
    });

    res.json({
      success: true,
      blobSha: response.data.content.sha,
      status: 200
    });
  } catch (error) {
    console.error('Error in addFileChanges:', error);
    res.status(500).json({ success: false, error: error.message, status: 500 });
  }
};

const createTreeWithBlob = async (token, repoFullName, path, blobSha, baseTreeSha) => {
  const url = `https://api.github.com/repos/${repoFullName}/git/trees`;
  const response = await axios.post(url, {
    base_tree: baseTreeSha,
    tree: [
      {
        path,
        mode: '100644',
        type: 'blob',
        sha: blobSha,
      }
    ]
  }, {
    headers: { Authorization: `token ${token}` }
  });

  return response.data.sha; // tree SHA
};

export const commitFileChanges = async (req, res) => {
  try {
    const { userId, repoFullName, branch, blobSha, commitMessage, path } = req.body;
    const token = await getGitHubToken(userId);

    const refUrl = `https://api.github.com/repos/${repoFullName}/git/refs/heads/${branch}`;
    const refResponse = await axios.get(refUrl, {
      headers: { Authorization: `token ${token}` }
    });
    const parentCommitSha = refResponse.data.object.sha;

    const commitUrl = `https://api.github.com/repos/${repoFullName}/git/commits/${parentCommitSha}`;
    const parentCommitRes = await axios.get(commitUrl, {
      headers: { Authorization: `token ${token}` }
    });
    const baseTreeSha = parentCommitRes.data.tree.sha;

    const treeSha = await createTreeWithBlob(token, repoFullName, path, blobSha, baseTreeSha);

    const newCommitUrl = `https://api.github.com/repos/${repoFullName}/git/commits`;
    const commitRes = await axios.post(newCommitUrl, {
      message: commitMessage,
      tree: treeSha,
      parents: [parentCommitSha]
    }, {
      headers: { Authorization: `token ${token}` }
    });

    await axios.patch(refUrl, {
      sha: commitRes.data.sha,
      force: false
    }, {
      headers: { Authorization: `token ${token}` }
    });

    res.json({
      success: true,
      commitSha: commitRes.data.sha,
      status: 200
    });
  } catch (error) {
    console.error('Error in commitFileChanges:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
      status: error.response?.status || 500
    });
  }
};

export const pushFileChanges = async (req, res) => {
  try {
    const { userId, repoFullName, branch, commitSha } = req.body;
    const token = await getGitHubToken(userId);

    const refUrl = `https://api.github.com/repos/${repoFullName}/git/refs/heads/${branch}`;

    const currentRef = await axios.get(refUrl, {
      headers: { Authorization: `token ${token}` }
    }).catch(error => {
      if (error.response?.status === 404) {
        throw new Error(`Branch ${branch} not found`);
      }
      throw error;
    });

    if (currentRef.data.object.sha !== commitSha) {
      const response = await axios.patch(refUrl, {
        sha: commitSha,
        force: false
      }, {
        headers: { Authorization: `token ${token}` }
      });

      res.json({
        success: true,
        ref: response.data,
        status: 200
      });
    } else {
      res.json({
        success: true,
        message: "Reference already up to date",
        status: 200
      });
    }
  } catch (error) {
    console.error('Error in pushFileChanges:', error);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    });
  }
};