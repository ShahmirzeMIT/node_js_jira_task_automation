import { db } from "../../../../config/firebase.js";

const githubAcfProject = async (req, res) => {
    try {
        const {
            project_id,
            type = "api_canvas" // Default to api_canvas if not specified
        } = req.body;

        if (!project_id) {
            return res.status(400).json({ error: "Project ID is required", status: 400 });
        }

        const projectRef = db.collection("projects").doc(project_id);
        const doc = await projectRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Project not found", status: 404 });
        }

        const data = doc.data();
        let parsedJson = {};
        let jsonField = type === "ui_canvas" ? "digital_service_json" : "api_json";

        // Try to get data from the preferred field first
        let rawJson = data[jsonField];

        // If preferred field is empty, fall back to api_json
        if (!rawJson && type === "ui_canvas") {
            jsonField = "api_json";
            rawJson = data.api_json;
        }

        // Parse and validate JSON
        try {
            if (typeof rawJson === "string") {
                parsedJson = JSON.parse(rawJson);
            } else if (rawJson && typeof rawJson === "object") {
                parsedJson = rawJson; // Already parsed
            } else {
                return res.status(422).json({ 
                    error: "No valid data found in either digital_service_json or api_json", 
                    status: 422
                });
            }

            if (typeof parsedJson !== "object" || Array.isArray(parsedJson) || parsedJson === null) {
                return res.status(422).json({ 
                    error: "Invalid data format in JSON field",
                    status: 422
                });
            }
        } catch (parseError) {
            console.warn("Invalid JSON in field:", jsonField, parseError);
            return res.status(422).json({ 
                error: `Invalid JSON in ${jsonField} field`,
                status: 422
            });
        }

        // Convert object to array of key-value pairs
        const responseArray = Object.entries(parsedJson).map(([key, value]) => ({
            key,
            value
        }));

        return res.status(200).json({
            data: responseArray,
            status: 200,
            source: jsonField // Include which field the data came from
        });
    } catch (error) {
        console.error("Error fetching project:", error);
        return res.status(500).json({ 
            error: "Internal server error",
            status: 500 
        });
    }
};

export default githubAcfProject;