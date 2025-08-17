import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// You will need to replace this with your actual API Gateway endpoint
const API_BASE_URL = 'YOUR_API_GATEWAY_URL';

const ImageList = () => {
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchImageKeys = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/images`);
        if (!response.ok) {
          throw new Error('Failed to fetch image list');
        }
        const data = await response.json();
        setImageKeys(data.images || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    };

    fetchImageKeys();
  }, []);

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  return (
    <div>
      <h1 className="mb-4">Image Gallery</h1>
      <div className="row">
        {imageKeys.map((key) => (
          <div key={key} className="col-md-4 mb-4">
            <div className="card">
              <Link to={`/image/${encodeURIComponent(key)}`}>
                {/* We will load the actual image later */}
                <div className="card-img-top bg-secondary" style={{ height: '200px' }} />
              </Link>
              <div className="card-body">
                <p className="card-text text-truncate">{key}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageList;
