'use strict';

const Alexa = require('ask-sdk-core');

const axios = require('axios');
const AWS = require('aws-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const getOnBrdApi = axios.create({
	baseURL: 'https://www.getonbrd.com/api/v0/',
});

const LaunchRequestHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
	},
	handle(handlerInput) {
		const speechText = '¡Hola! ¡Puedo mostrarte trabajos de cualquier tecnología en cualquier parte del mundo!';
		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
};

const HelpIntentHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
			&& Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
	},
	handle(handlerInput) {
		const speechText = 'Pídeme que te muestre trabajos de cualquier tecnología.';
		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
}

const CancelAndStopIntentHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
			&& (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
				|| Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
	},
	handle(handlerInput) {
		const speechText = '¡Adiós!';

		return handlerInput.responseBuilder
			.speak(speechText)
			.withShouldEndSession(true)
			.getResponse();
	}
};

const ErrorHandler = {
	canHandle() {
		return true;
	},
	handle(handlerInput, error) {
		console.error(error.message)
		const speechText = "Sucedió un error. Puedes intentarlo de nuevo.";
		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
};

const SessionEndedRequestHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
	},
	async handle(handlerInput) {
		const attributesManager = handlerInput.attributesManager;
		await attributesManager.deletePersistentAttributes();
		// Any clean-up logic goes here.
		return handlerInput.responseBuilder.getResponse();
	}
};

const SearchJobsIntentHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
			&& Alexa.getIntentName(handlerInput.requestEnvelope) === 'SearchJobsIntent'
	},
	async handle(handlerInput) {
		const attributesManager = handlerInput.attributesManager;
		const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'technology') || Alexa.getSlotValue(handlerInput.requestEnvelope, 'location')
		var speechText;

		var results;
		var error;

		await getOnBrdApi.get('search/jobs', {
			params: {
				query,
				per_page: 20,
				expand: ['company']
			}
		}).then(response => {
			results = response.data.data
		}).catch(error => {
			error = true;
		})

		if (error) {
			speechText = "Ocurrió un error realizando tu búsqueda. Intenta de nuevo más tarde."
		} else {
			let attributes = {
				query,
				results,
				index: 0
			}

			attributesManager.setPersistentAttributes(attributes);
			await attributesManager.savePersistentAttributes();

			speechText = `Encontré ${results.length} resultado${results.length !== 1 && 's'} para tu búsqueda "${query}". ${results.length > 0 && "Pídeme detalles del siguiente trabajo para comenzar a escucharlos."}`
		}

		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
};

const JobDetailsIntentHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
			&& handlerInput.requestEnvelope.request.intent.name === 'JobDetailsIntent';
	},
	async handle(handlerInput) {
		const attributesManager = handlerInput.attributesManager;
		const attributes = await attributesManager.getPersistentAttributes();

		if (!attributes.hasOwnProperty('index')) {
			let speechText = "Primero, es necesario que inicies una búsqueda."
			return handlerInput.responseBuilder
				.speak(speechText)
				.reprompt(speechText)
				.getResponse();
		}

		const index = attributes.index;
		const currentJob = attributes.results[index];

		attributesManager.setPersistentAttributes({
			query: attributes.query,
			results: attributes.results,
			index: attributes.index + 1
		});

		await attributesManager.savePersistentAttributes();

		const benefitsText = currentJob.attributes.perks.length > 0 ? `tiene ${currentJob.attributes.perks.length} beneficios.` : "";
		const remoteText = currentJob.attributes.remote ? "Es un trabajo remoto." : `Ubicado en ${currentJob.attributes.country}.`;
		const modalityText = `Modalidad ${currentJob.attributes.modality}.`;
		const experienceText = `Experiencia ${currentJob.attributes.seniority}.`;
		const companyText = `De la compañia ${currentJob.attributes.company.data.attributes.name}.`

		const speechText = `${currentJob.attributes.title}. ${companyText} ${benefitsText} ${remoteText} ${modalityText} ${experienceText}`

		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
};

const JobInterestIntentHandler = {
	canHandle(handlerInput) {
		return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
			&& Alexa.getIntentName(handlerInput.requestEnvelope) === 'JobInterestIntent';
	},
	async handle(handlerInput) {
		const attributesManager = handlerInput.attributesManager;
		const attributes = await attributesManager.getPersistentAttributes();

		if (!attributes.hasOwnProperty('index')) {
			let speechText = "Primero, es necesario que inicies una búsqueda."
			return handlerInput.responseBuilder
				.speak(speechText)
				.reprompt(speechText)
				.getResponse();
		}

		const index = attributes.index;
		const currentJob = attributes.results[index - 1];
		const speechText = `Para conocer más detalles del trabajo ${currentJob.attributes.title}, entra a getonbrd.com y busca la compañía ${currentJob.attributes.company.data.attributes.name}. ¡Suerte!`

		return handlerInput.responseBuilder
			.speak(speechText)
			.reprompt(speechText)
			.getResponse();
	}
}

exports.handler = Alexa.SkillBuilders.custom()
	.addRequestHandlers(
		LaunchRequestHandler,
		HelpIntentHandler,
		CancelAndStopIntentHandler,
		SessionEndedRequestHandler,
		SearchJobsIntentHandler,
		JobDetailsIntentHandler,
		JobInterestIntentHandler
	).addErrorHandlers(ErrorHandler)
	.withPersistenceAdapter(
		new ddbAdapter.DynamoDbPersistenceAdapter({
			tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
			createTable: false,
			dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
		})
	)
	.lambda();

