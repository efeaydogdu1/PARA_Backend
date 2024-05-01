const admin = require('firebase-admin');

/**
 * Constructor for data retrieval.
 */
class FirebaseHandler {
    constructor() {
        if (!FirebaseHandler.instance) {
          const serviceAccount = require('./para-73633-firebase-adminsdk-ocnda-efa95141de.json');
    
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
    
          this.db = admin.firestore();
          FirebaseHandler.instance = this;
        }
    
        return FirebaseHandler.instance;
    }

    /**
     * Initializes the collection with the specified collection name.
     * @param {string} collectionName - The name of the collection to initialize.
     */
    async get(collectionName) {
        this.collection = this.db.collection(collectionName);
    }

    /**
     * Creates a document with the provided data in the specified collection.
     * @param {JSON} data - Data to be created.
     * @returns {Promise<string>} - Resolves with the ID of the created document.
     * @throws {string} - Throws an error if there is an issue adding the document.
     */
    async create(data) {
        try {
            const docRef = await this.collection.add(data);
            console.log('Document written with ID: ', docRef.id);
            return docRef.id;
        } catch (error) {
            throw 'Error adding document: ' + error;
        }
    }

    /**
     * Gets the data of the document with the given document ID.
     * @param {string} documentId - The ID of the document.
     * @returns {Promise<Object|null>} - Resolves with the document data or null if the document does not exist.
     * @throws {string} - Throws an error if there is an issue getting the document.
     */
    async read(documentId) {
        try {
            const doc = await this.collection.doc(documentId).get();
            if (!doc.exists) {
                console.log('No such document!');
                return null;
            } else {
                console.log('Document data:', doc.data());
                return doc;
            }
        } catch (error) {
            throw 'Error getting document: ' + error;
        }
    }

    /**
     * Gets the all documents of the specified collection.
     * @returns {Promise<List<Object>|null>} - Resolves with the document data or null if the document does not exist.
     * @throws {string} - Throws an error if there is an issue getting the document.
     */
    async readAll() {
        try {
            const querySnapshot = await this.collection.get();
            const documents = [];
    
            querySnapshot.forEach((doc) => {
                if (doc.exists) {
                    documents.push(doc.data());
                }
            });
    
            //console.log('Documents data:', documents);
    
            if (documents.length === 0) {
                throw 'No documents found in the specified collection.';
            }
    
            return documents;
        } catch (error) {
            throw 'Error getting documents: ' + error;
        }
    }

    /**
     * Gets the data of the document(s) with the specified filter(s).
     * @param {any} filter - The [field, value] combination for filter.
     * @param {boolean} [limit=false] - If true, only one document will be returned. Default is set to false.
     * @returns {Promise<Object[]|Object>} - Resolves with an array of documents or a single document that match the filter.
     * @throws {string} - Throws an error if no document is found with the specified filter(s).
     * @throws {string} - Throws an error if there is an issue getting the documents.
     */
    async readWithFilter(filter, limit = false) {

        if(Object.keys(filter).length == 0){
            throw 'You must specify at least one [field, value] combination for filter.';
        }
        try {
          let query = this.collection;
      
          // Filtreyi uygula
          if (Object.keys(filter).length > 0) {
            Object.entries(filter).forEach(([field, value]) => {
              query = query.where(field, '==', value);
            });
          }
      
          const querySnapshot = await query.get();
          const documents = [];
      
          querySnapshot.forEach((doc) => {
            if (doc.exists) {
              documents.push(doc.data());
            }
          });
      
          console.log('Documents data:', documents);
          if(documents.length == 0){
            throw 'No document found with specified filter(s).';
          }

          if(limit == true){
            return documents.at(0);
          }else{
            return documents;
          }

        } catch (error) {
          throw 'Error getting documents: ' + error;
        }
    }

    /**
     * Updates the document with the specified document ID using the provided data.
     * @param {string} documentId - The ID of the document.
     * @param {JSON} newData - Data to be updated.
     * @throws {string} - Throws an error if there is an issue updating the document.
     */
    async update(documentId, newData) {
        try {
            await this.collection.doc(documentId).update(newData);
            console.log('Document updated successfully');
        } catch (error) {
            throw 'Error updating document: ' + error;
        }
    }

    /**
     * Deletes the document with the specified document ID.
     * @param {string} documentId - The ID of the document.
     * @throws {string} - Throws an error if there is an issue deleting the document.
     */
    async delete(documentId) {
        try {
            await this.collection.doc(documentId).delete();
            console.log('Document deleted successfully');
        } catch (error) {
            throw 'Error deleting document: ' + error;
        }
    }

}

module.exports = new FirebaseHandler();