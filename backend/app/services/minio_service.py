import io
from minio import Minio
from minio.error import S3Error
from datetime import timedelta
from app.config import settings

class MinIOService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False
        )
        self._ensure_buckets()

    def _ensure_buckets(self):
        for bucket in [settings.MINIO_BUCKET_RAW, settings.MINIO_BUCKET_PROCESSED]:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
            except Exception as e:
                print(f"MinIO bucket check error for '{bucket}': {e}")

    def upload_file(self, bucket_name: str, object_name: str, file_bytes: bytes, content_type: str = "application/pdf") -> str:
        data_stream = io.BytesIO(file_bytes)
        self.client.put_object(
            bucket_name=bucket_name,
            object_name=object_name,
            data=data_stream,
            length=len(file_bytes),
            content_type=content_type
        )
        return object_name

    def get_file_bytes(self, bucket_name: str, object_name: str) -> bytes:
        response = self.client.get_object(bucket_name, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_presigned_url(self, bucket_name: str, object_name: str, expires_hours: int = 24) -> str:
        # Returns URL accessible by external clients (browser)
        url = self.client.presigned_get_object(
            bucket_name,
            object_name,
            expires=timedelta(hours=expires_hours)
        )
        if settings.MINIO_ENDPOINT != settings.MINIO_EXTERNAL_ENDPOINT:
            # Replace internal container host with external host for web browser access
            url = url.replace(f"http://{settings.MINIO_ENDPOINT}", settings.MINIO_EXTERNAL_ENDPOINT)
            url = url.replace(f"https://{settings.MINIO_ENDPOINT}", settings.MINIO_EXTERNAL_ENDPOINT)
        return url

minio_service = MinIOService()
