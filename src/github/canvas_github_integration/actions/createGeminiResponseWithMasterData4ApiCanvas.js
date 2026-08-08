import axios from "axios";
import { db } from "../../../../config/firebase.js";

// Configure axios retry globally
const configureAxiosRetry = () => {
  axios.defaults.retry = 3;
  axios.defaults.retryDelay = 1000;
  
  axios.interceptors.response.use(undefined, (err) => {
    const config = err.config;
    if (!config || !config.retry) return Promise.reject(err);
    
    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= config.retry) return Promise.reject(err);
    
    config.__retryCount += 1;
    return new Promise(resolve => 
      setTimeout(() => resolve(axios(config)), config.retryDelay || 1)
    );
  });
};

configureAxiosRetry();

// Utility functions
const validateUserId = (userId) => {
  if (!userId || typeof userId !== 'string') {
    throw new Error("Invalid userId provided");
  }
};

const getUserToken = async (userId) => {
  validateUserId(userId);
  const doc = await db.collection('user_tokens').doc(userId).get();
  if (!doc.exists) throw new Error("Token not found");
  return doc.data().accessToken;
};

const getGitHubFileContent = async (accessToken, owner, repo, branch, filename) => {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${branch}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    return response.data.content
      ? Buffer.from(response.data.content, 'base64').toString('utf-8')
      : '';
  } catch (error) {
    console.error(`Error fetching GitHub file content: ${error.message}`);
    return '';
  }
};

// Data access functions
const getCanvasJson = async (collectionName, id) => {
  if (!id) return {};
  const doc = await db.collection(collectionName).doc(id).get();
  return doc.exists ? doc.data() : {};
};

const getTemplateData = async (templateId) => {
  const doc = await db.collection('ai_agent_template_canvas_list').doc(templateId).get();
  return doc.exists ? doc.data() : {};
};

const getGitRelationData = async (canvasId) => {
  const doc = await db.collection('canvas_git_file_relation').doc(canvasId).get();
  return doc.exists ? doc.data() : null;
};

// Core processing functions
const processTemplateAndGitFiles = async (templateId, accessToken) => {
  try {
    const templateData = await getTemplateData(templateId);
    const canvasLists = Array.isArray(templateData.canvas_list)
      ? templateData.canvas_list
          .map(item => item?.canvas_id)
          .filter(id => typeof id === 'string' && id.trim())
      : [];

    const githubFileContents = [];
    const apiJsonList = {};

    for (const canvasId of canvasLists) {
      if (!canvasId) continue;
      
      apiJsonList[canvasId] = await getCanvasJson('api_canvas', canvasId);
      
      const gitData = await getGitRelationData(canvasId);
      if (!gitData) continue;

      const projects = Array.isArray(gitData.projects) 
        ? gitData.projects 
        : [gitData];

      for (const project of projects.filter(p => p?.owner && p?.repo && p?.filename)) {
        const fileContent = await getGitHubFileContent(
          accessToken,
          project.owner,
          project.repo,
          project.branch || 'main',
          project.filename
        );
        
        if (fileContent) {
          githubFileContents.push({
            canvas_id: canvasId,
            owner: project.owner,
            repo: project.repo,
            branch: project.branch || 'main',
            filename: project.filename,
            content: fileContent
          });
        }
      }
    }

    return { 
      githubFileContents, 
      apiJsonList 
    };
  } catch (err) {
    console.error("Error in processTemplateAndGitFiles:", err);
    return { 
      githubFileContents: [], 
      apiJsonList: {} 
    };
  }
};

const getCoreApiCanvasJson = async (apiCanvasId) => {
  const jsonData = await getCanvasJson('api_canvas', apiCanvasId);
  try {
    return jsonData?.json ? JSON.parse(jsonData.json) : {};
  } catch (e) {
    console.error("Error parsing JSON from Firebase:", e);
    return {};
  }
};

// Prompt generation functions
const formatExampleSection = (data) => {
  const { githubFileContents, apiJsonList } = data;
  
  return Object.entries(apiJsonList)
    .map(([key, body], index) => {
      const relatedFiles = githubFileContents.filter(f => f.canvas_id === key);
      const fileSections = relatedFiles.map((file, j) => `
        -----------------------FILE INFO for example ${index + 1}------------
        File order : ${index + 1}.${j + 1}
        FILE NAME: ${file.filename}
        FILE CONTENT: ${file.content}
        --------------------------------------------
      `).join('');

      return `
        *******************************************************
        Example Sample ${index + 1}:
        API JSON: ${JSON.stringify(body)}
        
        ${fileSections}
        ********************************************************
      `;
    })
    .join('');
};

const generatePrompt = (apiCanvasJson, progLanguage, exampleSection) => {
  return `
    Generate detailed source code for the given JSON below in the programming language given below. 
    Note that I'll copy and paste the result directly to the text editor in order to simplify the reading for the developers. 
    Source code will be copied to the single file with the format .java, .js, .ts, or etc. 
    Source code must include everything, such as import, export lines. Don't add extra line except the original source code commands
    
    **************************************************************************************
    **JSON Format**: ${JSON.stringify(apiCanvasJson)}
    **************************************************************************************
    **Programming Language = "${progLanguage}"**
    **************************************************************************************

    **Description of the API JSON given above**

    - "Api": {
        "List": { "sSQzlZ9": "/create/customer" },
        "RequestBody": {
          "sSQzlZ9": "{\\n    \\"name\\": \\"John\\",\\n    \\"surname\\": \\"Muller\\",\\n    \\"middleName\\": \\"John\\",\\n    \\"city\\": \\"\\",\\n    \\"country\\": \\"\\"\\n}"
        },
        "ResponseBody": { "sSQzlZ9": "{\\n    \\"id\\": \\"111111\\"    \\n}" }
    } : object Api.List contains the list of APIs with ID. "sSQzlZ9" is the api id for API called "/create/customer". 
    Api.RequestBody key involves the HTTP request JSON body format for the api with id="sSQzlZ9". 
    And "Api.ResponseBody" is a HTTP response body of api with id='sSQzlZ9'

    - Api: "Input": {
        "sSQzlZ9": {
            "Y2W1eXc": { "inputName": "name", "description": "Is Mandatory" },
            "6C4L5JY": { "inputName": "surname", "description": "Is Mandatory" },
            "Ln5ElgQ": { "inputName": "middle_name", "description": "Is Mandatory" },
            "tqQT9nY": { "inputName": "city", "description": "" },
            "TJTeFUZ": { "inputName": "country", "description": "" }
        }
    },
    "Output": {
        "sSQzlZ9": { "h6Fm3do": { "inputName": "id", "description": "" } }
    }, 
    : here Api.Input object is inputs list of the API with id="sSQzlZ9" where input objects consist of ("inputName":"") and "description":"". 
    The same action belongs to the Api.output.

    -Api: "Operation": {
        "sSQzlZ9": {
            "GfubtXq": { "type": "common", "description": "Create new ID" },
            "8NA89yL": { "type": "common", "description": "Insert to Customer table" }
        }
    }: Api.Operation is the list of the operation done in the API. This is the guide to the developers what to code. 
    Each line is a private method name in the class function. Api.Operation["sSQzlZ9"]['GfubtXq'].type can be ['json','common','insert','update','delete','select']. 
    .description key can be single sentence. 

    *********************************************************************************************
    Based on the examples samples below I want you to generate the source code for the given JSON below in the programming language given below.
    
    ${exampleSection}
  `;
};

// Main function
const generateSourceCode = async (req, res) => {
  try {
    const { ApiCanvasId, progLanguage, templateId, userId } = req.body;
    
    // Validate required parameters
    if (!ApiCanvasId || !progLanguage || !templateId || !userId) {
      return res.status(400).json({ 
        error: "Missing required parameters", 
        status: 400 
      });
    }

    const accessToken = await getUserToken(userId);
    const templateData = await processTemplateAndGitFiles(templateId, accessToken);
    const apiCanvasJson = await getCoreApiCanvasJson(ApiCanvasId);

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({
        error: "Gemini API key not configured",
        status: 500
      });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
    const exampleSection = formatExampleSection(templateData);
    const prompt = generatePrompt(apiCanvasJson, progLanguage, exampleSection);

    const response = await axios.post(apiUrl, {
      contents: [{ 
        parts: [{ text: prompt }] 
      }]
    });

    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("No generated content received from Gemini API");
    }

    const generatedText = response.data.candidates[0].content.parts[0].text;
    const cleanedText = generatedText.replace(/```json|```/g, "").trim();

    res.status(200).json({
      status: 200,
      generatedCode: cleanedText,
      githubFiles: templateData.githubFileContents.map(f => ({
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
    
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || "Unknown error occurred";
    
    res.status(status).json({
      error: status === 503 
        ? "Service temporarily unavailable. Please try again later." 
        : message,
      status
    });
  }
};

export default generateSourceCode;