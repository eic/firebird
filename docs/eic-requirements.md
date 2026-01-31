# Requirements for the Event Display for Electron Ion Collider

These requirements aim to develop a versatile and user-friendly event display for Electron Ion Collider detectors such as ePIC and the future IP8 detector, fulfilling two primary purposes: (1) enabling outreach through enhanced visualization of detector and physics data, and (2) facilitating detailed debugging of simulation and reconstruction. The event display should also be adaptable to accommodate future technological advancements and the evolving needs of the scientific community that utilizes the detectors.

## 1\. Purpose and Use Cases

### Scientific Research and Analysis

- **Visualization:** Enables visual interpretation of complex data, including detector geometry, particle trajectories, sub-detectors responses, physical processes, etc. (see “Technical requirements” section for more details)  
- **Detector Design and Optimization**: Assists in optimizing the design of individual subsystems, enhancing overall detector efficiency.  
- **Collaborative Analysis:** Supports collaborative efforts in troubleshooting and refining reconstruction and simulation processes by providing a common online platform capable of sharing visualization among collaborators.


### Particle Reconstruction and Simulation Debugging and Quality Control

- **Comprehensive Debugging Tools:** Provides an integrated platform for visual debugging of both particle reconstruction and detector simulations. Event display engine provides a palette of additional tools such as information visualization API, ray tracing, data loaders, etc. That is utilized by subsequent modules or plugins enabling fine tailored debugging and data exploration experience.  
- **Algorithm Verification:** Assists in verifying the accuracy and efficiency of reconstruction algorithms by comparing visualized reconstructed events with known data or simulations  
- **Algorithm Optimization**: Helps in fine-tuning reconstruction algorithms and validating simulation models.  
- **Data comparison:** Enables the visual comparison of data produced on different stages of the processing chain or between different frames. Such as simulated data vs. reconstructed data, vs. raw detector outputs.  
- **Subsystem-Specific Troubleshooting**: Enhances understanding of the interplay between different detector subsystems in both simulations and reconstructions.  
- **Data Quality Monitoring:** Helps monitor the quality of detector geometry and simulation allowing integration with existing continuous integration (CI) pipelines. In future collected data in real-time might be displayed.

### Educational and Outreach

- **Professional Communication:** Event display is used by physicists and engineers to create compelling content for professional presentations, conferences, press releases, and scientific publications.  
- **Public Engagement and Science Communication**: Enhances public lectures, seminars, and exhibitions, making complex scientific concepts accessible and engaging to a wider audience. Promote EIC specific cases in terms of detector subsystems or specific measurements (like showing a SIDIS event or a jet).   
- **Showcasing Technology and Innovation:** Demonstrating convergence of physics, engineering and computing, showcasing the technological innovations behind scientific research at EIC.

## 2\. Technical Requirements

### Platform Compatibility and Accessibility 

* **Web-based**. The event display should be web-based, ensuring easy access by users from various devices and operating systems.  
* **For central and local use**. It must be capable of both:  
  * public deployment \- making event display available without having to install anything other than a browser  
  * local running on development machines \- aiming for debugging, testing and working with custom geometries or data 

	***Use case:*** There will be one or several central web installations that work with the collaboration defined production geometry and data. But also there is a need for users working locally on detector optimization, new detectors, algorithms, etc. to use an event display for debugging. To support this, event display should be easily accessible locally, e.g. through packet managers such as PyPi or NPM and configurable to what data it should work with. Ideally with a straight forward CLI interface and designed configuration methods. Choosing the server side technologies should ensure then, that the chosen software could be equally capable working in these two realms. 

### Software and Computing Requirements

* **EIC data and infrastructure.** Ensure compatibility with the existing computing infrastructure of the EIC.   
  ***Use cases:***  Central event display installation should be able to work with globally accessible data such as the outputs from the simulation campaigns. It should be possible to open those files, look through events using the geometry used for the data. At the same time, it should also be possible to open local files. (See more in the Data Handling section)  
* **Streaming readout.** This must include support of future streaming readout DAQ. The event display development should follow streaming readout chain development to be able to reflect and work with SRO data and data-flow.   
  ***Use cases:***  
* ***In DAQ and raw data mode allow to show hits and real-time arriving data in time***  
* ***Working with data from reconstructed software, it should be able to display with even-like data structures such as frames, events, sub-events***  
* Overlay   
    
* **Security.** Implement high standards of data security and integrity. Being centrally accessible via web interface automatically implies that both front and back ends might be targets of various cyberattacks. The event display should be developed with high cybersecurity standards to minimize such risks.   
* **Automated tools compatible**. Should be able to work in a batch mode as a tool in other parts of EIC data processing and software development chains, such as Continuous Integration systems, Data Quality Monitoring and Validation.

### Modularity and Extensibility

* The software architecture should be modular, allowing for the addition and configuration of features through plugins or extensions. This should include possibility of using different data and geometry adapters  
* Enable easy integration of new functionalities as the EIC evolves.  
  * Being able to make interactive presentations which might include animations  
  * Use of VR and AR

### Visualization Capabilities

* **Physics and detector**. Accurate and detailed representation of physics and particle interactions, including:  
  * hits  
  * tracks,  
  * active detector elements  
  * calorimeter data,   
  * vertex information  
  * jets  
* **Hierarchy aware**. Features to visualize different detector subsystems and layers in a 3D environment.  
* **Configurable**. Customizable visualization options like color coding and labeling for different particle types and detector parts.  
* **Batch mode graphics.** Capability to generate graphics/screenshots in batch mode, without invoking the browser GUI. The capability for batch mode graphics generation allows automated creation of visuals, like PNG images of the detector, directly from command line inputs without requiring a graphical user interface, essential for integration into automated workflows like continuous integration systems or for remote processing on server farms.  
* **Animations**. The event display should support physics and detector animation. This is especially important for SRO support.   
  ***Use case:*** Currently, the most general use event display libraries use static 3D presentation based on the concept of single events without possibility to properly visualize 4th time dimension (there are some capabilities but they are limited).  There are event displays that work with such animations but they are very experiment specific (e.g. Belle 2 Unity based ED). Supporting EIC streaming readout data presentation implies that presented processes should fully support time playback. This means that the event display and its API should be developed so that time playback capability was the first class citizen from the beginning.   
* **Visualization API**. On the API level, the resulting event display software core should be able to provide ways to organize visualization primitives and functions, such as data and geometry loaders, standard ways to display data, treat user GUI inputs, and provide ways of configuration.   
  ***Use case:*** The general API should be utilized by plugins and modules that subsequently will add functionality to facilitate concrete experiment event display needs. 

### User Interface and Interaction

* **Ease of use**. Intuitive, user-friendly interface with robust navigation and control features.  
* **Navigation.** Capabilities for zooming, rotating, and detailed examination of 3D visualizations. Navigation should also support through detector, physics, scene, data.   
* **Shareable.** Ability to share the view and a state between users  
* **Presets.** Configurable predefined view presets. This might include a dedicated outer GUI to switch between representations, scenes, examples, etc.   
* **Event Selection**. Capabilities of flexible event selection  
* **Data examination**. Detailed examination using the full information of the data.   
  ***Use cases:***  
  * It should be possible using ray tracing to hover/click on tracks, hits, objects and get their underlying info. Such as particle momentum, PID, reconstruction status \- etc.   
  * It should be possible to add (via plugins/modules) other interactive tools, such as e.g. a ruler that allows measuring distance between surfaces, particles, objects, etc. 

### Data Handling

* **Compatibility** with various data formats used in EIC experiments. The event display should be able to work with different types of files, such as output of full simulation and/or output of the reconstruction.   
  ***Use cases:*** Utilizing modularity and ED library API, it should be possible to write custom data loaders/formatters that would allow to render different data and geometry types. It should be possible for an event/frame to work with multiple data sources and It should be possible for a physicist/detector expert to add custom visualization for existing or new data.   
* **IO Efficiency**. Fast access to relevant parts of large datasets typical in HENP physics experiments.  
* **Remote data sources.** Seamless integration with EIC's simulation campaigns, allowing for the visualization of simulated data.  
* **Export.** Allow export of geometry and visualization to at least one standard 3D format (gltf or obj, 3mf etc.) 

## 3\. Development requirements

### Testing, Validation, and Community Engagement

* **Integration**. Comprehensive testing with EIC data to ensure accuracy and reliability.  
* **Testing.** Use of unit tests, automated integration tests and reliability tests  
* **Collaboration.** Collaboration with EIC physics groups and the broader scientific community for feedback and continuous improvement.

### Experiment Agnosticism

* **Use outside of EIC**. The design must accommodate EIC-specific data while retaining flexibility for potential adaptation to other experiments.  
* **Compatible to all EIC experiments.** The event display must support the ePIC experiment. But also, complementary to the modular structure of the event display engine, development must ensure that the future IP8 detector could use the software without major customizations. Meaning that there are no hardcoded ePIC specific parts or dependencies that can’t be easily used for other experiments, rewired or reconfigured. 

### Documentation and Training

* **Documentation.** Provide detailed documentation for both developers and users.  
* **Training.** Develop training materials and sessions to facilitate the usage of the event display within the EIC community.

