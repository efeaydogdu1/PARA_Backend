const { parseAndPrintTranscript } = require('./pdfreader.js');

// Replace 'path_to_transcript.pdf' with the actual path to your PDF file
const pdfPath = 'C:\\Users\\Public\\PARA-backend\\Transcript.pdf';

parseAndPrintTranscript(pdfPath)
    .then(transcript => {
        console.log("Transcript Object:", JSON.stringify(transcript, null, 2));
    })
    .catch(error => {
        console.error("Error processing PDF:", error);
    });
