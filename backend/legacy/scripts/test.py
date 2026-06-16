from nvidia_setup import get_nvidia_client

ai = get_nvidia_client()

answer = ai.chat("Explain this compliance issue in simple business language.")
print(answer)