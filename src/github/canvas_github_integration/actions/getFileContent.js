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

const getFileContent = async (req, res) => {
    try {
        // Extract parameters from request body instead of query
        const { userId, repoFullName, path, branch } = req.body;
        
        if (!userId || !repoFullName || !path) {
            return res.status(400).json({ error: "Missing required parameters: userId, repoFullName, or path",status:400  });
        }

        // Split repoFullName into owner and repo
        const [owner, repo] = repoFullName.split('/');
        if (!owner || !repo) {
            return res.status(400).json({ error: "Invalid repoFullName format. Expected 'owner/repo'",status:400  });
        }

        const token = await getUserToken(userId);
        
        // Build URL with branch parameter if provided (for newly created files)
        let url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        if (branch) {
            url += `?ref=${branch}`;
        }
        
        const response = await axios.get(
            url,
            {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+raw"
                }
            }
        );

        // Handle both file and base64 encoded content
        let content;
        if (response.data.content) {
            content = Buffer.from(response.data.content, 'base64').toString();
        } else if (response.data) {
            content = response.data; // For raw content
        } else {
            throw new Error("No content found in response");
        }

        res.status(200).json({ content,status:200 });
    } catch (error) {
        console.error("Error fetching file content:", error);
        res.status(500).json({ 
            error: error.response?.data?.message || error.message || "Unknown error occurred" ,
            status:500 
        });
    }
};

export default getFileContent;