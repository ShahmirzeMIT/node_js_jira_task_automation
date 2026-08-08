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

// Helper function to fetch single file content
const fetchFileContent = async (token, node) => {
    try {
        const url = `https://api.github.com/repos/${node.githubRepoFullName}/contents/${node.githubPath}`;
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            params: {
                ref: node.githubBranch || 'main'
            },
            timeout: 5000 // 5 seconds timeout
        });

        // Decode base64 content if exists
        let content = '';
        if (response.data.content && response.data.encoding === 'base64') {
            content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        }

        return {
            success: true,
            data: {
                id: node.id,
                name: node.name,
                path: node.githubPath,
                githubRepoFullName: node.githubRepoFullName,
                content: content,
                size: response.data.size || 0,
                sha: response.data.sha,
                html_url: response.data.html_url,
                download_url: response.data.download_url
            }
        };
    } catch (error) {
        console.error(`Error fetching ${node.githubPath}:`, error.message);
        return {
            success: false,
            error: error.message,
            node: node
        };
    }
};

const getGithubContentForCrd = async (req, res) => {
    try {
        const { userId, selectedNodes, prNumber } = req.body;

        // Validate required fields
        if (!userId || !selectedNodes || !Array.isArray(selectedNodes)) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: userId and selectedNodes array"
            });
        }

        console.log(`Processing PR #${prNumber || 'N/A'}: ${selectedNodes.length} files`);

        // Get user token
        const token = await getUserToken(userId);

        // Process files in parallel with limit to avoid rate limiting
        const MAX_CONCURRENT = 5;
        const results = [];
        
        // Process in batches
        for (let i = 0; i < selectedNodes.length; i += MAX_CONCURRENT) {
            const batch = selectedNodes.slice(i, i + MAX_CONCURRENT);
            
            const batchPromises = batch.map(node => 
                fetchFileContent(token, node)
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Small delay between batches to avoid rate limiting
            if (i + MAX_CONCURRENT < selectedNodes.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Separate successful and failed requests
        const successfulResults = results.filter(r => r.success);
        const failedResults = results.filter(r => !r.success);

        // Send response
        res.status(200).json({
            success: true,
            prNumber: prNumber,
            totalFiles: selectedNodes.length,
            fetchedFiles: successfulResults.length,
            failedFiles: failedResults.length,
            files: successfulResults.map(r => r.data),
            failures: failedResults.map(r => ({
                node: r.node,
                error: r.error
            }))
        });

    } catch (error) {
        console.error("Error in getGithubContentForCrd:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

export default getGithubContentForCrd;