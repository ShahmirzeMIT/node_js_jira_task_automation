import axios from "axios";
import { db } from "../../../../config/firebase.js";

const getUserToken = async (userId) => {
    if (!userId || typeof userId !== 'string') throw new Error("Invalid userId provided");
    const doc = await db.collection('user_tokens').doc(userId).get();
    if (!doc.exists) throw new Error("Token not found");
    return doc.data().accessToken;
};

const getGitHubFileContent = async (accessToken, owner, repo, branch, filename) => {
    try {
        const url = `https://ui.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': `token ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        return response.data.content
            ? Buffer.from(response.data.content, 'base64').toString('utf-8')
            : null;
    } catch (error) {
        console.error(`Error fetching GitHub file content: ${error.message}`);
        return null;
    }
};

const GetUICanvasJson = async (ui_id) => {
    if (!ui_id) return '';
    const refDoc = await db.collection('ui_canvas').doc(ui_id).get();
    return refDoc.exists ? refDoc.data() : {};
};

const TemplateCanvasAndGitFilePair = async (templateId, accessToken) => {
    try {
        let templateData = {};
        const templateDoc = await db.collection('ai_agent_template_canvas_list').doc(templateId).get();
        if (templateDoc.exists) templateData = templateDoc.data();

        const canvasLists = Array.isArray(templateData.canvas_list)
            ? templateData.canvas_list.map(item => item?.canvas_id).filter(id => typeof id === 'string' && id.trim())
            : [];

        const githubFileContents = [];
        const uiJsonList = {};

        for (const canvas_id of canvasLists) {
            if (!canvas_id) continue;
            const uiJson = await GetUICanvasJson(canvas_id);
            uiJsonList[canvas_id] = uiJson;

            const gitRelationDoc = await db.collection('canvas_git_file_relation').doc(canvas_id).get();
            if (!gitRelationDoc.exists) continue;

            const gitData = gitRelationDoc.data();
            const projects = Array.isArray(gitData.projects) ? gitData.projects : [gitData];

            for (const project of projects.filter(p => p?.owner && p?.repo && p?.filename)) {
                const fileContent = await getGitHubFileContent(accessToken, project.owner, project.repo, project.branch || 'main', project.filename);
                if (fileContent) {
                    githubFileContents.push({
                        canvas_id,
                        owner: project.owner,
                        repo: project.repo,
                        branch: project.branch || 'main',
                        filename: project.filename,
                        content: fileContent
                    });
                }
            }
        }

        return { GithubFileContents: githubFileContents, uiJsonBody: uiJsonList };
    } catch (err) {
        console.error("Error in TemplateCanvasAndGitFilePair:", err);
        return { GithubFileContents: [], uiJsonBody: {} };
    }
};

const GetCoreuiCanvasJson = async (UiCanvasId, res) => {
    const uiCanvasDoc = await db.collection('ui_canvas').doc(UiCanvasId).get();
    if (!uiCanvasDoc.exists) return res.status(404).json({ error: "ui Canvas not found", status: 404 });

    try {
        const jsonData = uiCanvasDoc.data()?.json;
        return jsonData ? JSON.parse(jsonData) : {};
    } catch (e) {
        console.error("Error parsing JSON from Firebase:", e);
        return {};
    }
};

const GetExampleSection = (data) => {
    const { GithubFileContents, uiJsonBody } = data;
    return Object.entries(uiJsonBody).map(([key, body], index) => {
        let section = `*******************************************************\n
                        Example Sample ${index + 1}: \n
                        ui JSON: ${JSON.stringify(body)} \n\n
                        `;
                        
        const relatedFiles = GithubFileContents.filter(f => f.canvas_id === key);
        relatedFiles.forEach((file, j) => {
            section += `-----------------------FILE INFO for example ${index + 1}------------\n
                        File order : ${index + 1}.${j + 1} \n
                        FILE NAME: ${file.filename} \n
                        FILE CONTENT: ${file.content} \n
                        --------------------------------------------\n`;
        });
        return section + `********************************************************\n`;
    }).join('');
};

const generateSourceCode = async (req, res) => {
    try {
        const { UiCanvasId, progLanguage, templateId, userId } = req.body;
        if (!UiCanvasId || !progLanguage || !templateId || !userId) {
            return res.status(400).json({ error: "Missing required parameters", status: 400 });
        }

        const accessToken = await getUserToken(userId);
        const templateData = await TemplateCanvasAndGitFilePair(templateId, accessToken);
        const uiCanvasJson = await GetCoreuiCanvasJson(UiCanvasId, res);

        // const API_KEY = "AIzaSyDY1pAEDlCP0MuqExbBFrJyA2bLsASlvgA";
        // const apiUrl = https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY};

        const ui_KEY = process.env.GEMINI_API_KEY;
        const uiUrl =`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ui_KEY}`
        const exampleSection = GetExampleSection(templateData);

      const prompt = `Generate detailed source code for the given JSON below in the programming language given below. Note that I'll copy and paste the 
        result directly to the text editor in order to simplify the reading for the developers. Source code will be copied to the single file
        with the format .java, .js, .ts, or etc. Source code must include everything, such as import, export lines. Don't add extra line except the original 
        source code commands
        
        **************************************************************************************
        **JSON Format** :${JSON.stringify(uiCanvasJson)}
        ****************************************************************************************
        **Programming Language = "${progLanguage}"**
        ***************************************************************************************

        **Description of the ui JSON given above**

        - "ui": {
            "List": { "sSQzlZ9": "/create/customer" },
            "RequestBody": {
                "sSQzlZ9": "{\n    \"name\": \"John\",\n    \"surname\": \"Muller\",\n    \"middleName\": \"John\",\n    \"city\": \"\",\n    \"country\": \"\"\n}"
            },
            "ResponseBody": { "sSQzlZ9": "{\n    \"id\": \"111111\"    \n}" }
        } : object ui.List contains the list of uis with ID. "sSQzlZ9" is the ui id for ui called "/create/customer". ui.RequestBody key 
        involve the HTTP request JSON body format for the ui with id="sSQzlZ9". And "ui.ResponseBody" is a HTTP response body of ui with id='sSQzlZ9'

        - ui: "Input": {
            "sSQzlZ9": {
                "Y2W1eXc": { "inputName": "name", "description": "Is Mandatory" },
                "6C4L5JY": { "inputName": "surname", "description": "Is Mandatory" },
                "Ln5ElgQ": {
                "inputName": "middle_name",
                "description": "Is Mandatory"
                },
                "tqQT9nY": { "inputName": "city", "description": "" },
                "TJTeFUZ": { "inputName": "country", "description": "" }
            }
            },
            "Output": {
            "sSQzlZ9": { "h6Fm3do": { "inputName": "id", "description": "" } }
            }, : here ui.Input object is inputs list of the ui with id="sSQzlZ9" where input objects consist of ("inputName":"") and "description":"". 
            The same action belong the ui.output.

        -ui: "Operation": {
            "sSQzlZ9": {
                "GfubtXq": { "type": "common", "description": "Create new ID" },
                "8NA89yL": {
                "type": "common",
                "description": "Insert to Customer table"
                }
            }
        }: ui.Operation is the list of the operation done in the ui. This is the guide to the developers what to code. Each line is a private method 
        name in the class function. ui.Operation["sSQzlZ9"]['GfubtXq'].type can be ['json','common','insert','update','delete','select']. .description key 
        can be single sentence. 

         *********************************************************************************************
         Based on the examples samples below I want you to generate the source code for the given JSON below in the programming language given below.
         
      ${exampleSection}`;

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        const response = await axios.post(uiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanedText = generatedText.replace(/```json|```/g, "").trim();

        res.status(200).json({
            status: 200,
            generatedCode: cleanedText,
            githubFiles: templateData.GithubFileContents.map(f => ({
                canvas_id: f.canvas_id,
                filename: f.filename,
                owner: f.owner,
                repo: f.repo,
                branch: f.branch
            })),
            prompt
        });
    } catch (error) {
        console.error("Error in generateSourceCode:", error);
        res.status(500).json({
            error: error.response?.data?.message || error.message || "Unknown error occurred",
            status: 500
        });
    }
};

export default generateSourceCode;