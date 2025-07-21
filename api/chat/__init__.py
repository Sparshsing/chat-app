import logging
import json
import os
import openai
from azure.functions import HttpRequest, HttpResponse

# To use Azure OpenAI, you can use the following code:
# from openai import AzureOpenAI
# client = AzureOpenAI(
#   azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT"), 
#   api_key=os.getenv("AZURE_OPENAI_KEY"),  
#   api_version="2024-02-01"
# )

# Or, for other providers, use the standard OpenAI library
if os.getenv("OPENAI_API_KEY"):
    openai.api_key = os.environ.get("OPENAI_API_KEY")
if os.getenv("OPENAI_API_BASE"):
    openai.base_url = os.environ.get("OPENAI_API_BASE")


async def main(req: HttpRequest) -> HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')

    try:
        body = await req.get_json()
        messages = body.get('messages')

        if not messages:
            return HttpResponse(
                "Please pass messages in the request body",
                status_code=400
            )

        async def generate():
            try:
                # You can configure the model in your environment settings
                model = os.environ.get("OPENAI_MODEL", "gpt-3.5-turbo")
                
                stream = await openai.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True
                )
                async for chunk in stream:
                    content = chunk.choices[0].delta.content
                    if content:
                        # SSE format: data: <json_string>\n\n
                        yield f"data: {json.dumps(content)}\n\n"
                
            except Exception as e:
                logging.error(f"Error during OpenAI stream: {e}")
                error_message = "Sorry, there was an error with the AI provider."
                yield f"data: {json.dumps(error_message)}\n\n"
            finally:
                # Signal the end of the stream
                yield "data: [DONE]\n\n"

        return HttpResponse(
            generate(),
            status_code=200,
            mimetype="text/event-stream",
            headers={
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            }
        )

    except json.JSONDecodeError:
        return HttpResponse(
             "Invalid JSON in request body.",
             status_code=400
        )
    except Exception as e:
        logging.error(f"An error occurred: {e}")
        return HttpResponse(
            "An internal server error occurred.",
            status_code=500
        ) 