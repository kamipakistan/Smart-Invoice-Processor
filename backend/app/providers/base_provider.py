from abc import ABC, abstractmethod
from typing import List, Dict, Any
from app.schemas.extraction import InvoiceExtractionSchema

class BaseAIProvider(ABC):
    @abstractmethod
    def extract_invoice_data(self, image_bytes_list: List[bytes]) -> InvoiceExtractionSchema:
        """
        Processes list of image bytes (PDF rendered pages) and extracts structured Invoice JSON matching 16 target fields.
        """
        pass
