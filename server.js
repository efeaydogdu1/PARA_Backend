const express = require("express");
const parseAndPrintTranscript = require("./pdfreader");
const cors = require("cors");
const bodyParser = require("body-parser");
const { run } = require("./Database_pull");

const app = express();

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(bodyParser.json());

// Route for handling file upload and parsing transcript
app.post("/parse-transcript", async (req, res) => {
  try {
    // Call the parseAndPrintTranscript function with the provided PDF path
    const transcript = await parseAndPrintTranscript(req.body.pdfPath);
    // Send the parsed transcript as JSON response
    res.json(transcript);
  } catch (error) {
    res.status(500).send(`Error parsing transcript: ${error}`);
    console.log("A");
  }
});

app.post("/recommendations", async (req, res) => {
  try {
    const userID = req.body.userID;
    // Call the parseAndPrintTranscript function with the provided PDF path
    const transcript = await run(userID);
    // Send the parsed transcript as JSON response
    res.json(transcript);
  } catch (error) {
    res.status(500).send(`Error parsing transcript: ${error}`);
    console.log("A");
  }
});

// Define the port number for the server to listen on
const PORT = 4005;

// Start the server and listen for incoming requests
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
