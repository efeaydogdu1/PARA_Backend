const { parseAndPrintTranscript } = require('./pdfreader.js');

// Replace 'path_to_transcript.pdf' with the actual path to your PDF file
/*const pdfPath = 'C:\\Users\\Public\\PARA-backend\\Transcript.pdf';

parseAndPrintTranscript(pdfPath)
    .then(transcript => {
        console.log("Transcript Object:", JSON.stringify(transcript, null, 2));
    })
    .catch(error => {
        console.error("Error processing PDF:", error);
    });
*/

function formatAdmitSemester(admitSemester) {
    // Regex to match the pattern "Fall 2019-2020"
    // It captures the season part and the year range part separately
    // This regex will ensure spaces around the hyphen are properly managed.
    const regex = /(\w+)\s(\d{4})-(\d{4})/;

    // Replace and reformat the string using the captured groups
    // The $2 and $3 refer to the captured year parts, and $1 refers to the semester part.
    // We're adding spaces around the hyphen for correct formatting.
    return admitSemester.replace(regex, '$2 - $3 / $1');
}   
const originalFormat = "Fall 2019-2020";
const formatted = formatAdmitSemester(originalFormat);
console.log(formatted)