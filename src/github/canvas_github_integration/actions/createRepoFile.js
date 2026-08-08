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

const createRepoFile = async (req, res) => {
    try {
        // Extract parameters from request body
        const { userId, repoFullName, branch, path, content, commitMessage } = req.body;
        
        // Validate required parameters
        if (!userId || !repoFullName || !path || commitMessage === undefined) {
            return res.status(400).json({ 
                error: "Missing required parameters: userId, repoFullName, path, or commitMessage",
                status: 400  
            });
        }

        // Split repoFullName into owner and repo
        const [owner, repo] = repoFullName.split('/');
        if (!owner || !repo) {
            return res.status(400).json({ 
                error: "Invalid repoFullName format. Expected 'owner/repo'",
                status: 400  
            });
        }

        const token = await getUserToken(userId);
        
        // Prepare the request data
        const requestData = {
            message: commitMessage,
            content: Buffer.from(content || "").toString('base64'),
            path: path
        };

        // Add branch if provided
        if (branch) {
            requestData.branch = branch;
        }

        const response = await axios.put(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
            requestData,
            {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json"
                }
            }
        );

        res.status(200).json({ 
            data: response.data,
            status: 200 
        });
    } catch (error) {
        console.error("Error creating file:", error);
        res.status(500).json({ 
            error: error.response?.data?.message || error.message || "Unknown error occurred",
            status: 500 
        });
    }
};

export default createRepoFile;