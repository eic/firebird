## Merge

```bash
pyrobird merge file1.json file2.json [file3.json ...]
````

Merges two or more Firebird DEX JSON files together. 
    
    - Merges entries based on their IDs
    - For entries with matching IDs, combines their components together
    - By default, the command fails if components with the same name exist in different files
    - Special flags control conflict resolution behavior:

4. **Special Flags**:
    - `--reset-id` or `-r`: Resets entry IDs to sequential numbers (0,1,2...) so first entries merge, second entries merge, etc.
    - `--ignore` or `-i`: When duplicate component names are found, keeps the component from the left file and ignores the right file's component
    - `--overwrite` or `-o`: When duplicate component names are found, replaces the left file's component with the right file's component
    - `--output` or `-O`: Specifies the output file (default is stdout)


1. **Merge Simulation and Reconstruction Data**:
   ```
   pyrobird merge simulation.json reconstruction.json -O merged.json
   ```

2. **Combine Events with Reset IDs**:
   ```
   pyrobird merge --reset-id event1.json event2.json event3.json
   ```

3. **Merge Files, Ignoring Conflicts**:
   ```
   pyrobird merge --ignore primary.json secondary.json
   ```

4. **Merge Files, Overwriting Components**:
   ```
   pyrobird merge --overwrite base.json updates.json
   ```

The command is flexible and powerful, allowing for various data combination scenarios while providing clear feedback about conflicts and their resolution.