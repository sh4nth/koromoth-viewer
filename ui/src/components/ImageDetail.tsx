import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

// You will need to replace this with your actual API Gateway endpoint
const API_BASE_URL = '';

const ImageDetail = () => {
  const { imageKey } = useParams<{ imageKey: string }>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageKey) return;

    const fetchImageDetails = async () => {
      try {
        // Fetch image URL
        const imageUrlResponse = await fetch(`${API_BASE_URL}/image/${imageKey}`);
        if (!imageUrlResponse.ok) throw new Error('Failed to fetch image URL');
        const imageUrlData = await imageUrlResponse.json();
        setImageUrl(imageUrlData.imageUrl);

        // Fetch tags
        const tagsResponse = await fetch(`${API_BASE_URL}/image/${imageKey}/tags`);
        if (!tagsResponse.ok) throw new Error('Failed to fetch tags');
        const tagsData = await tagsResponse.json();
        setTags(tagsData.tags || []);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    };

    fetchImageDetails();
  }, [imageKey]);

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>{imageKey}</h1>
        <Link to="/" className="btn btn-primary">Back to Gallery</Link>
      </div>
      
      {imageUrl ? (
        <img src={imageUrl} className="img-fluid rounded mb-4" alt={imageKey} />
      ) : (
        <div className="text-center">Loading image...</div>
      )}

      <div>
        <h3>Tags</h3>
        {tags.length > 0 ? (
          <ul className="list-inline">
            {tags.map((tag) => (
              <li key={tag} className="list-inline-item">
                <span className="badge bg-secondary">{tag}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No tags found for this image.</p>
        )}
      </div>
    </div>
  );
};

export default ImageDetail;
