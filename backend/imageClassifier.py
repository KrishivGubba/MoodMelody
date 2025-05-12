from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import torch
from typing import Tuple, List, Optional, Dict, Union
import logging
from pathlib import Path
import numpy as np

class ImageActivityClassifier:
    """A class to classify images into activity categories for music recommendations using CLIP model."""
    
    def __init__(self, model_name: str = "openai/clip-vit-base-patch32"):
        """Initialize the classifier with a CLIP model."""
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
        # Define activity categories
        self.base_activities = [
            # Study/Focus
            "music for coding",
            
            # Gaming
            "gaming music",
            
            # Chill/Relax
            "lofi beats",
            
            # Social
            "party music",
            
            # Ambient
            "ambient soundscape",
            
            # Reading
            "music for reading",
        ]
        
        # Add descriptive prompts to help CLIP understand the activities better
        self.activity_prompts = [
            "a person coding on a computer",
            "people playing video games",
            "someone relaxing with headphones on",
            "people at a party dancing",
            "a peaceful nature scene",
            "someone reading a book"
        ]
        
        try:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.logger.info(f"Using device: {self.device}")
            
            self.model = CLIPModel.from_pretrained(model_name).to(self.device)
            self.processor = CLIPProcessor.from_pretrained(model_name)
            self.model.eval()
            
        except Exception as e:
            self.logger.error(f"Error initializing model: {str(e)}")
            raise

    def get_top_n_predictions(self, probs: torch.Tensor, activities: List[str], n: int = 3) -> List[Tuple[str, float]]:
        """Get top N predictions with their confidence scores."""
        top_probs, top_indices = torch.topk(probs, k=min(n, len(activities)))
        return [(activities[idx], prob.item() * 100) 
                for idx, prob in zip(top_indices[0], top_probs[0])]

    @torch.no_grad()
    def classify(self, image: Union[str, Image.Image], top_n: int = 3) -> Optional[List[Tuple[str, float]]]:
        """Classify an image directly into activity categories for music recommendations.
        
        Args:
            image: Either a path to an image file (str) or a PIL Image object
            top_n (int): Number of top predictions to return
            
        Returns:
            Optional[List[Tuple[str, float]]]: List of (activity, confidence) pairs or None if classification fails
        """
        try:
            # Handle both string paths and PIL Images
            if isinstance(image, str):
                try:
                    path = Path(image)
                    if not path.exists():
                        raise FileNotFoundError(f"Image file not found: {image}")
                    image = Image.open(path).convert('RGB')
                except Exception as e:
                    self.logger.error(f"Error loading image from path: {str(e)}")
                    return None
            elif not isinstance(image, Image.Image):
                raise ValueError("Image must be either a file path or a PIL Image object")
            
            # Use activity prompts to better classify the image
            # Combine the activity prompts with the music categories
            text_inputs = self.activity_prompts
            
            # Prepare inputs
            inputs = self.processor(
                text=text_inputs,
                images=image,
                return_tensors="pt",
                padding=True
            )
            
            # Move inputs to the same device as model
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Get prediction
            outputs = self.model(**inputs)
            probs = outputs.logits_per_image.softmax(dim=1)
            
            # Get top activities based on the image
            activity_predictions = self.get_top_n_predictions(probs, self.base_activities, top_n)
            
            return activity_predictions
            
        except Exception as e:
            self.logger.error(f"Error during classification: {str(e)}")
            return None

def main():
    """Main function to demonstrate the classifier usage."""
    classifier = ImageActivityClassifier()
    
    # Example usage with both file path
    test_images = [
        "study.jpg",
        "gaming.jpeg",
        "party.jpeg"
    ]
    
    # Test with file paths
    for image_path in test_images:
        try:
            predictions = classifier.classify(image_path)
            if predictions:
                print(f"\nTop music recommendations for {image_path}:")
                for music_type, confidence in predictions:
                    print(f"- {music_type}: {confidence:.2f}%")
        except Exception as e:
            print(f"Error processing {image_path}: {str(e)}")
    
    # Test with PIL Image
    try:
        test_image = Image.open("test.jpg").convert('RGB')
        predictions = classifier.classify(test_image)
        if predictions:
            print(f"\nTop music recommendations for PIL Image:")
            for music_type, confidence in predictions:
                print(f"- {music_type}: {confidence:.2f}%")
    except Exception as e:
        print(f"Error processing PIL Image: {str(e)}")

# if __name__ == "__main__":
#     main()